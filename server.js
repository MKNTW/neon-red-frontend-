// server.js - Бэкенд для NEON RED магазина с админ-панелью
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const path = require('path');
const { Resend } = require('resend');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Multer для файлов (временное хранение)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Middleware
// Сжатие ответов для улучшения производительности
app.use(compression());
app.use(cors({
    origin: [
        'https://shop.mkntw.xyz',
        'https://apiforshop.mkntw.xyz',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Supabase клиент
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// JWT секрет
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Resend клиент
const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) {
    console.warn('⚠️  RESEND_API_KEY не установлен. Отправка email не будет работать.');
}
const resend = new Resend(RESEND_API_KEY);

// === КОНСТАНТЫ ===
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 секунд между повторными отправками
const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 минут срок действия кода
const TOKEN_EXPIRY = '7d'; // 7 дней срок действия токена
const CODE_LENGTH = 6; // Длина кода подтверждения
const BCRYPT_SALT_ROUNDS = 10;
const PRODUCTS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 минут
const PRODUCTS_PER_PAGE = 20;

const productsCache = {
    data: null,
    timestamp: null,
    featured: null,
    featuredTimestamp: null
};

function getCachedProducts(featured = false) {
    const cache = featured ? productsCache.featured : productsCache.data;
    const timestamp = featured ? productsCache.featuredTimestamp : productsCache.timestamp;
    
    if (cache && timestamp && Date.now() - timestamp < PRODUCTS_CACHE_TTL_MS) {
        return cache;
    }
    return null;
}

function setCachedProducts(products, featured = false) {
    if (featured) {
        productsCache.featured = products;
        productsCache.featuredTimestamp = Date.now();
    } else {
        productsCache.data = products;
        productsCache.timestamp = Date.now();
    }
}

// === ФУНКЦИИ ДЛЯ EMAIL ПОДТВЕРЖДЕНИЯ ===

// Генерация 6-значного кода
function generateCode() {
    const min = Math.pow(10, CODE_LENGTH - 1);
    const max = Math.pow(10, CODE_LENGTH) - 1;
    return Math.floor(min + Math.random() * (max - min + 1)).toString();
}

// Отправка кода подтверждения на email
async function sendVerificationCode(email, code) {
    try {
        if (!RESEND_API_KEY) {
            throw new Error('RESEND_API_KEY не установлен. Проверьте переменные окружения.');
        }

        console.log('[sendVerificationCode] Attempting to send email to:', email);
        console.log('[sendVerificationCode] Resend API key present:', !!RESEND_API_KEY);

        const { data, error } = await resend.emails.send({
            from: 'NEON RED <noreply@mail.mkntw.xyz>',
            to: email,
            subject: 'Код подтверждения NEON RED',
            html: `
                <div style="font-family: Arial, sans-serif; background: #0a0a0a; padding: 30px; color: #fff; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #ff0033; margin-bottom: 20px;">🔴 Подтверждение почты</h2>
                    <p style="font-size: 16px; line-height: 1.6;">Ваш код подтверждения:</p>
                    <div style="
                        font-size: 32px;
                        letter-spacing: 8px;
                        font-weight: bold;
                        margin: 20px 0;
                        color: #ff0033;
                        text-align: center;
                        background: #1a1a1a;
                        padding: 20px;
                        border-radius: 8px;
                        border: 2px solid #ff0033;
                    ">
                        ${code}
                    </div>
                    <p style="font-size: 14px; color: #888;">Код действителен <b>10 минут</b>.</p>
                    <p style="font-size: 12px; color: #666; margin-top: 30px;">Если это не вы — просто проигнорируйте письмо.</p>
                </div>
            `
        });

        if (error) {
            console.error('[sendVerificationCode] Resend API error:', error);
            console.error('[sendVerificationCode] Error details:', JSON.stringify(error, null, 2));
            throw new Error(error.message || 'Ошибка отправки email через Resend');
        }

        console.log('[sendVerificationCode] Email sent successfully, ID:', data?.id);
        return true;
    } catch (error) {
        console.error('[sendVerificationCode] Error sending verification code:', error);
        console.error('[sendVerificationCode] Error stack:', error.stack);
        throw error;
    }
}

// === МИДЛВАР ДЛЯ АУТЕНТИФИКАЦИИ ===
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Требуется аутентификация' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Неверный токен' });
        }
        req.user = user;
        next();
    });
};

const authenticateAdmin = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ error: 'Требуются права администратора' });
    }
    next();
};

// === АУТЕНТИФИКАЦИЯ ===

// Проверка доступности имени пользователя
app.get('/api/check-username/:username', async (req, res) => {
    try {
        const { username } = req.params;
        
        if (!username || username.trim().length < 3) {
            return res.json({ available: false, error: 'Имя пользователя должно быть не менее 3 символов' });
        }
        
        const cleanUsername = username.trim();
        
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('username', cleanUsername)
            .single();
            
        if (existingUser) {
            return res.json({ available: false, error: 'Это имя пользователя уже занято. Пожалуйста, выберите другое.' });
        }
        
        res.json({ available: true });
    } catch (error) {
        console.error('Check username error:', error);
        res.json({ available: true }); // В случае ошибки считаем доступным
    }
});

// Регистрация
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, fullName } = req.body;

        // Базовая валидация
        if (!username || !email) {
            return res.status(400).json({ error: 'Обязательные поля: username, email' });
        }
        
        // Валидация username
        if (typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 50) {
            return res.status(400).json({ error: 'Имя пользователя должно быть от 3 до 50 символов' });
        }
        
        // Валидация email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (typeof email !== 'string' || !emailRegex.test(email.trim())) {
            return res.status(400).json({ error: 'Неверный формат email' });
        }
        
        // Пароль может быть временным (будет установлен позже)
        let passwordHash = null;
        if (password && password !== 'temp_password_will_be_changed') {
            if (typeof password !== 'string' || password.length < 6 || password.length > 100) {
                return res.status(400).json({ error: 'Пароль должен быть от 6 до 100 символов' });
            }
            passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
        } else {
            // Создаём временный пароль, который нужно будет изменить
            const saltRounds = 10;
            passwordHash = await bcrypt.hash('temp_' + Date.now(), saltRounds);
        }
        
        // Очистка данных
        const cleanUsername = username.trim();
        const cleanEmail = email.trim().toLowerCase();

        // Проверка существования пользователя только по username (email может быть одинаковым)
        // Используем транзакцию для атомарности проверки и создания
        const { data: existingUserByUsername, error: usernameError } = await supabase
            .from('users')
            .select('id, email_verified')
            .eq('username', cleanUsername)
            .maybeSingle();
            
        if (usernameError) {
            console.error('Error checking existing users:', usernameError);
            return res.status(500).json({ 
                error: 'Ошибка при проверке существующих пользователей',
                message: 'Попробуйте позже'
            });
        }

        if (existingUserByUsername) {
            // Если пользователь существует, но email не подтверждён, можно разрешить повторную регистрацию
            // Но для безопасности лучше запретить
            return res.status(400).json({ 
                error: 'Пользователь с таким именем уже существует',
                message: 'Попробуйте другое имя пользователя или войдите в существующий аккаунт'
            });
        }

        // Пароль уже обработан выше

        // Первый пользователь - админ (warning: change for prod)
        const { count, error: countError } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true });
            
        if (countError) {
            console.error('Error counting users:', countError);
            throw new Error('Ошибка при проверке количества пользователей');
        }
            
        const isAdmin = count === 0;

        // Создаём пользователя БЕЗ подтверждения email
        const { data: user, error } = await supabase
            .from('users')
            .insert([{
                username: cleanUsername,
                email: cleanEmail,
                password_hash: passwordHash,
                full_name: fullName ? fullName.trim() : null,
                is_admin: isAdmin,
                email_verified: false
            }])
            .select()
            .single();

        if (error) {
            // Проверяем, не существует ли уже пользователь (race condition или повторная попытка)
            if (error.code === '23505' || error.code === 'P2002' || error.message?.includes('duplicate') || error.message?.includes('unique') || error.message?.includes('violates unique constraint')) {
                // Пользователь уже существует - проверяем, какой именно конфликт
                const { data: existingUser } = await supabase
                    .from('users')
                    .select('id, username, email')
                    .eq('username', cleanUsername)
                    .maybeSingle();
                
                if (existingUser) {
                    return res.status(400).json({ 
                        error: 'Пользователь с таким именем уже существует',
                        message: 'Попробуйте другое имя пользователя или войдите в существующий аккаунт'
                    });
                }
                
                // Если конфликт по email (хотя мы разрешаем одинаковые email)
                return res.status(400).json({ 
                    error: 'Ошибка при создании пользователя',
                    message: 'Попробуйте позже или используйте другие данные'
                });
            }
            console.error('Error creating user:', error);
            console.error('Error details:', JSON.stringify(error, null, 2));
            throw error;
        }

        // Проверяем, есть ли активный временный код для этого email
        const { data: tempCode } = await supabase
            .from('email_verifications')
            .select('*')
            .eq('email', cleanEmail)
            .is('user_id', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        let code, codeHash;

        if (tempCode && new Date(tempCode.expires_at) > new Date()) {
            // Используем существующий временный код
            // Обновляем его, привязывая к user_id
            const { error: updateError } = await supabase
                .from('email_verifications')
                .update({ user_id: user.id })
                .eq('id', tempCode.id);

            if (updateError) {
                console.error('Error updating temp code:', updateError);
                await supabase.from('users').delete().eq('id', user.id);
                throw new Error('Ошибка при обновлении кода');
            }

            // Код уже был отправлен ранее, не отправляем повторно
        } else {
            // Генерируем новый код подтверждения
            code = generateCode();
            codeHash = await bcrypt.hash(code, 10);

            // Сохраняем код в таблицу email_verifications
            const { error: codeError } = await supabase
                .from('email_verifications')
                .insert([{
                    user_id: user.id,
                    email: cleanEmail,
                    code_hash: codeHash,
                    expires_at: new Date(Date.now() + CODE_EXPIRY_MS).toISOString(),
                    last_sent_at: new Date().toISOString()
                }]);

            if (codeError) {
                console.error('Error saving verification code:', codeError);
                // Удаляем пользователя, если не удалось сохранить код
                await supabase.from('users').delete().eq('id', user.id);
                throw new Error('Ошибка при создании кода подтверждения');
            }

            // Отправляем код на email
            try {
                await sendVerificationCode(cleanEmail, code);
            } catch (emailError) {
                console.error('Error sending email:', emailError);
                // Удаляем пользователя и код, если не удалось отправить email
                await supabase.from('email_verifications').delete().eq('user_id', user.id);
                await supabase.from('users').delete().eq('id', user.id);
                throw new Error('Ошибка при отправке кода подтверждения на email');
            }
        }

        // Создаём JWT токен для автоматического входа после подтверждения
        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username, 
                isAdmin: user.is_admin 
            },
            JWT_SECRET,
            { expiresIn: TOKEN_EXPIRY }
        );

        res.status(201).json({
            success: true,
            needsCodeConfirmation: true,
            message: 'Код подтверждения отправлен на почту',
            email: cleanEmail,
            token: token, // Токен для автоматического входа после подтверждения
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                fullName: user.full_name,
                isAdmin: user.is_admin,
                emailVerified: false
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
        });
        
        // Улучшенная обработка ошибок
        let statusCode = 500;
        let errorMessage = 'Ошибка регистрации';
        
        if (error.message?.includes('уже существует') || error.message?.includes('duplicate') || error.message?.includes('unique')) {
            statusCode = 400;
            errorMessage = 'Пользователь с таким именем уже существует';
        } else if (error.message?.includes('проверке')) {
            statusCode = 500;
            errorMessage = 'Ошибка при проверке данных. Попробуйте позже.';
        } else if (error.message?.includes('код')) {
            statusCode = 500;
            errorMessage = 'Ошибка при создании кода подтверждения';
        } else if (error.message?.includes('email')) {
            statusCode = 500;
            errorMessage = 'Ошибка при отправке кода на email';
        }
        
        res.status(statusCode).json({ 
            error: errorMessage,
            message: error.message || 'Неизвестная ошибка'
        });
    }
});

// Отправка кода проверки email (до регистрации)
app.post('/api/send-email-code', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Требуется email' });
        }

        const cleanEmail = email.trim().toLowerCase();
        console.log('[send-email-code] Processing email:', cleanEmail);

        // Валидация email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanEmail)) {
            return res.status(400).json({ error: 'Неверный формат email' });
        }

        // Проверяем, не зарегистрирован ли уже этот email
        const { data: existingUser, error: userCheckError } = await supabase
            .from('users')
            .select('id, email_verified')
            .eq('email', cleanEmail)
            .maybeSingle();

        if (userCheckError) {
            console.error('[send-email-code] Error checking user:', userCheckError);
        }

        if (existingUser) {
            if (existingUser.email_verified) {
                return res.status(400).json({ error: 'Этот email уже зарегистрирован и подтверждён' });
            }
            // Если email зарегистрирован, но не подтверждён, используем существующую логику
            return res.status(400).json({ error: 'Этот email уже зарегистрирован. Используйте повторную отправку кода.' });
        }

        // Проверяем последнюю отправку для этого email (временные коды)
        // Пробуем найти по email, если поле существует
        let lastTemp = null;
        let lastTempError = null;

        try {
            const { data, error } = await supabase
                .from('email_verifications')
                .select('*')
                .eq('email', cleanEmail)
                .is('user_id', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            
            lastTemp = data;
            lastTempError = error;
        } catch (err) {
            console.warn('[send-email-code] Warning: email field might not exist, trying alternative:', err.message);
            // Если поле email не существует, пробуем найти по другим полям
            // Это fallback для старых версий таблицы
        }

        if (lastTempError) {
            console.warn('[send-email-code] Error checking last temp code (might be missing email field):', lastTempError.message);
        }

        if (lastTemp && lastTemp.last_sent_at) {
            const diff = Date.now() - new Date(lastTemp.last_sent_at).getTime();
            if (diff < RESEND_COOLDOWN_MS) {
                const secondsLeft = Math.ceil((RESEND_COOLDOWN_MS - diff) / 1000);
                return res.status(429).json({
                    error: 'Подождите перед повторной отправкой',
                    message: `Подождите ${secondsLeft} секунд перед повторной отправкой`
                });
            }

            // Удаляем старый временный код
            await supabase
                .from('email_verifications')
                .delete()
                .eq('id', lastTemp.id);
        }

        // Генерируем код
        const code = generateCode();
        const codeHash = await bcrypt.hash(code, 10);
        console.log('[send-email-code] Generated code for:', cleanEmail);

        // Сохраняем временный код (без user_id, только email)
        // Пробуем сохранить с полем email, если оно существует
        let insertError = null;
        
        try {
            // Сначала удаляем старые временные коды для этого email
            const deleteResult = await supabase
                .from('email_verifications')
                .delete()
                .eq('email', cleanEmail)
                .is('user_id', null);
            
            if (deleteResult.error) {
                console.warn('[send-email-code] Warning deleting old codes:', deleteResult.error.message);
            }

            const { error } = await supabase
                .from('email_verifications')
                .insert([{
                    email: cleanEmail,
                    code_hash: codeHash,
                    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                    last_sent_at: new Date().toISOString()
                }]);

            insertError = error;
        } catch (err) {
            console.error('[send-email-code] Error inserting code (email field might not exist):', err);
            // Если поле email не существует, сохраняем без него (временное решение)
            // В этом случае код будет работать только после регистрации
            console.log('[send-email-code] Attempting to save without email field...');
            
            const { error } = await supabase
                .from('email_verifications')
                .insert([{
                    code_hash: codeHash,
                    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                    last_sent_at: new Date().toISOString()
                }]);
            
            insertError = error;
        }

        if (insertError) {
            console.error('[send-email-code] Error saving email verification code:', insertError);
            console.error('[send-email-code] Error details:', JSON.stringify(insertError, null, 2));
            return res.status(500).json({ 
                error: 'Ошибка при создании кода',
                message: insertError.message || 'Проверьте структуру таблицы email_verifications'
            });
        }

        // Отправляем код
        console.log('[send-email-code] Sending email to:', cleanEmail);
        try {
            await sendVerificationCode(cleanEmail, code);
            console.log('[send-email-code] Email sent successfully');
        } catch (emailError) {
            console.error('[send-email-code] Error sending email:', emailError);
            console.error('[send-email-code] Email error details:', JSON.stringify(emailError, null, 2));
            // Удаляем сохранённый код, если не удалось отправить email
            await supabase
                .from('email_verifications')
                .delete()
                .eq('code_hash', codeHash);
            
            return res.status(500).json({ 
                error: 'Ошибка при отправке кода на email',
                message: emailError.message || 'Проверьте настройки Resend API'
            });
        }

        res.json({
            success: true,
            message: 'Код подтверждения отправлен на почту'
        });

    } catch (error) {
        console.error('[send-email-code] Unexpected error:', error);
        console.error('[send-email-code] Error stack:', error.stack);
        res.status(500).json({ 
            error: 'Ошибка отправки кода',
            message: error.message || 'Неизвестная ошибка'
        });
    }
});

// Подтверждение email кодом
app.post('/api/confirm-email', async (req, res) => {
    try {
        const { email, code } = req.body;

        if (!email || !code) {
            return res.status(400).json({ error: 'Требуются email и код' });
        }

        const cleanEmail = email.trim().toLowerCase();
        const cleanCode = code.trim();

        // Находим пользователя (нужны все поля для создания токена)
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, username, email, email_verified, is_admin')
            .eq('email', cleanEmail)
            .maybeSingle();

        if (userError) {
            console.error('[confirm-email] Error finding user:', userError);
            console.error('[confirm-email] Error details:', JSON.stringify(userError, null, 2));
            return res.status(500).json({ 
                error: 'Ошибка при поиске пользователя',
                message: userError.message || 'Неизвестная ошибка'
            });
        }

        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        if (user.email_verified) {
            return res.status(400).json({ error: 'Email уже подтверждён' });
        }

        // Находим последний код подтверждения (по user_id или email)
        let record = null;
        let recordError = null;
        
        // Сначала ищем по user_id
        const { data: recordByUserId, error: errorByUserId } = await supabase
            .from('email_verifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
            
        if (errorByUserId) {
            console.error('[confirm-email] Error finding code by user_id:', errorByUserId);
            // Не прерываем выполнение, пробуем найти по email
        }
            
        if (recordByUserId) {
            record = recordByUserId;
        } else {
            // Если не нашли по user_id, ищем по email (временный код)
            try {
                const { data: recordByEmail, error: errorByEmail } = await supabase
                    .from('email_verifications')
                    .select('*')
                    .eq('email', cleanEmail)
                    .is('user_id', null)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                    
                if (errorByEmail) {
                    console.error('[confirm-email] Error finding code by email:', errorByEmail);
                    // Если поле email не существует, это нормально - пробуем только по user_id
                    console.log('[confirm-email] Email field might not exist, trying user_id only');
                } else if (recordByEmail) {
                    record = recordByEmail;
                }
            } catch (err) {
                console.warn('[confirm-email] Error querying by email (field might not exist):', err.message);
                // Продолжаем, если поле email не существует
            }
        }

        if (!record && (errorByUserId || recordError)) {
            console.error('[confirm-email] No code found and errors occurred');
            return res.status(500).json({ 
                error: 'Ошибка при поиске кода подтверждения',
                message: 'Попробуйте запросить новый код'
            });
        }

        if (!record) {
            return res.status(400).json({ error: 'Код не найден. Запросите новый код.' });
        }

        // Проверяем срок действия
        if (new Date(record.expires_at) < new Date()) {
            return res.status(400).json({ error: 'Код истёк. Запросите новый код.' });
        }

        // Проверяем код
        const valid = await bcrypt.compare(cleanCode, record.code_hash);
        if (!valid) {
            return res.status(400).json({ error: 'Неверный код' });
        }

        // Подтверждаем email
        const { error: updateError } = await supabase
            .from('users')
            .update({ email_verified: true })
            .eq('id', user.id);

        if (updateError) {
            console.error('[confirm-email] Error updating email_verified:', updateError);
            return res.status(500).json({ 
                error: 'Ошибка при подтверждении email',
                message: updateError.message || 'Неизвестная ошибка'
            });
        }

        // Удаляем использованный код (и по user_id, и по email для временных кодов)
        try {
            await supabase
                .from('email_verifications')
                .delete()
                .eq('user_id', user.id);
        } catch (deleteError) {
            console.warn('[confirm-email] Error deleting code by user_id:', deleteError);
        }
        
        // Также удаляем временные коды по email (если поле существует)
        try {
            await supabase
                .from('email_verifications')
                .delete()
                .eq('email', cleanEmail)
                .is('user_id', null);
        } catch (deleteError) {
            console.warn('[confirm-email] Error deleting code by email (field might not exist):', deleteError);
            // Это нормально, если поле email не существует
        }

        // Проверяем наличие необходимых полей для создания токена
        if (!user.username) {
            console.error('[confirm-email] User username is missing:', user);
            return res.status(500).json({ 
                error: 'Ошибка: данные пользователя неполные',
                message: 'Отсутствует имя пользователя'
            });
        }

        // Создаём JWT токен для автоматического входа
        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username, 
                isAdmin: user.is_admin || false
            },
            JWT_SECRET,
            { expiresIn: TOKEN_EXPIRY }
        );

        // Получаем обновлённые данные пользователя
        const { data: updatedUser, error: fetchUserError } = await supabase
            .from('users')
            .select('id, username, email, full_name, is_admin, email_verified')
            .eq('id', user.id)
            .single();

        if (fetchUserError || !updatedUser) {
            console.error('[confirm-email] Error fetching updated user:', fetchUserError);
            // Используем данные из user, если не удалось получить обновлённые
            const userData = {
                id: user.id,
                username: user.username,
                email: user.email,
                fullName: null,
                isAdmin: user.is_admin || false,
                emailVerified: true
            };
            
            return res.json({
                success: true,
                message: 'Email успешно подтверждён',
                token: token,
                user: userData
            });
        }

        res.json({
            success: true,
            message: 'Email успешно подтверждён',
            token: token,
            user: {
                id: updatedUser.id,
                username: updatedUser.username,
                email: updatedUser.email,
                fullName: updatedUser.full_name,
                isAdmin: updatedUser.is_admin,
                emailVerified: updatedUser.email_verified
            }
        });

    } catch (error) {
        console.error('[confirm-email] Unexpected error:', error);
        console.error('[confirm-email] Error stack:', error.stack);
        console.error('[confirm-email] Error details:', JSON.stringify(error, null, 2));
        res.status(500).json({ 
            error: 'Ошибка подтверждения',
            message: error.message || 'Неизвестная ошибка'
        });
    }
});

// Повторная отправка кода
app.post('/api/resend-code', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Требуется email' });
        }

        const cleanEmail = email.trim().toLowerCase();
        console.log('[resend-code] Processing email:', cleanEmail);

        // Находим пользователя
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, email_verified')
            .eq('email', cleanEmail)
            .maybeSingle();

        if (userError) {
            console.error('[resend-code] Error finding user:', userError);
            return res.status(500).json({ 
                error: 'Ошибка при поиске пользователя',
                message: userError.message
            });
        }

        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        if (user.email_verified) {
            return res.status(400).json({ error: 'Email уже подтверждён' });
        }

        // Проверяем последнюю отправку
        const { data: last, error: lastError } = await supabase
            .from('email_verifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (lastError) {
            console.error('[resend-code] Error checking last code:', lastError);
            console.error('[resend-code] Error details:', JSON.stringify(lastError, null, 2));
            return res.status(500).json({ 
                error: 'Ошибка при проверке последнего кода',
                message: lastError.message
            });
        }

        if (last && last.last_sent_at) {
            const diff = Date.now() - new Date(last.last_sent_at).getTime();
            if (diff < RESEND_COOLDOWN_MS) {
                const secondsLeft = Math.ceil((RESEND_COOLDOWN_MS - diff) / 1000);
                return res.status(429).json({
                    error: 'Подождите перед повторной отправкой',
                    message: `Подождите ${secondsLeft} секунд перед повторной отправкой`
                });
            }

            // Удаляем старый код
            const deleteResult = await supabase
                .from('email_verifications')
                .delete()
                .eq('id', last.id);
            
            if (deleteResult.error) {
                console.warn('[resend-code] Warning deleting old code:', deleteResult.error.message);
            }
        }

        // Генерируем новый код
        const code = generateCode();
        const codeHash = await bcrypt.hash(code, 10);
        console.log('[resend-code] Generated new code for user:', user.id);

        // Сохраняем новый код
        const { error: insertError } = await supabase
            .from('email_verifications')
            .insert([{
                user_id: user.id,
                email: cleanEmail,
                code_hash: codeHash,
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                last_sent_at: new Date().toISOString()
            }]);

        if (insertError) {
            console.error('[resend-code] Error saving new code:', insertError);
            console.error('[resend-code] Insert error details:', JSON.stringify(insertError, null, 2));
            return res.status(500).json({ 
                error: 'Ошибка при создании нового кода',
                message: insertError.message || 'Проверьте структуру таблицы email_verifications'
            });
        }

        // Отправляем код
        console.log('[resend-code] Sending email to:', cleanEmail);
        try {
            await sendVerificationCode(cleanEmail, code);
            console.log('[resend-code] Email sent successfully');
        } catch (emailError) {
            console.error('[resend-code] Error sending email:', emailError);
            console.error('[resend-code] Email error details:', JSON.stringify(emailError, null, 2));
            // Удаляем сохранённый код, если не удалось отправить email
            await supabase
                .from('email_verifications')
                .delete()
                .eq('code_hash', codeHash);
            
            return res.status(500).json({ 
                error: 'Ошибка при отправке кода на email',
                message: emailError.message || 'Проверьте настройки Resend API'
            });
        }

        res.json({
            success: true,
            message: 'Новый код отправлен на почту'
        });

    } catch (error) {
        console.error('[resend-code] Unexpected error:', error);
        console.error('[resend-code] Error stack:', error.stack);
        res.status(500).json({ 
            error: 'Ошибка отправки кода',
            message: error.message || 'Неизвестная ошибка'
        });
    }
});

// Вход
app.post('/api/login', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // Валидация
        const loginValue = username || email;
        if (!loginValue || !password) {
            return res.status(400).json({ error: 'Требуются username/email и password' });
        }
        
        if (typeof loginValue !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ error: 'Неверный формат данных' });
        }

        const cleanValue = loginValue.trim();
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanValue);

        // Поиск пользователя по username или email
        let user, error;
        
        if (isEmail) {
            // Поиск по email
            const result = await supabase
                .from('users')
                .select('*')
                .eq('email', cleanValue.toLowerCase())
                .maybeSingle();
            user = result.data;
            error = result.error;
        } else {
            // Поиск по username
            const result = await supabase
                .from('users')
                .select('*')
                .eq('username', cleanValue)
                .maybeSingle();
            user = result.data;
            error = result.error;
        }

        if (error) {
            console.error('Login query error:', error);
            return res.status(500).json({ error: 'Ошибка при поиске пользователя' });
        }
        
        if (!user) {
            return res.status(401).json({ error: 'Неверные учетные данные' });
        }

        // Проверка пароля
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Неверные учетные данные' });
        }

        // Проверка подтверждения email
        if (!user.email_verified) {
            return res.status(403).json({ 
                error: 'Email не подтверждён',
                needsCodeConfirmation: true,
                email: user.email
            });
        }

        // Создание JWT токена
        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username, 
                isAdmin: user.is_admin 
            },
            JWT_SECRET,
            { expiresIn: TOKEN_EXPIRY }
        );

        res.json({
            message: 'Вход выполнен',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                fullName: user.full_name,
                isAdmin: user.is_admin
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Ошибка входа' });
    }
});

// Проверка токена
app.get('/api/validate-token', authenticateToken, async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('id, username, email, full_name, is_admin, avatar_url')
            .eq('id', req.user.id)
            .single();
            
        if (error || !user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        res.json({ 
            valid: true, 
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                fullName: user.full_name,
                isAdmin: user.is_admin,
                avatar_url: user.avatar_url
            }
        });
    } catch (error) {
        console.error('Validate token error:', error);
        res.status(500).json({ error: 'Ошибка проверки токена' });
    }
});

// === ПРОФИЛЬ ===

// Обновление профиля
app.put('/api/profile', authenticateToken, async (req, res) => {
    try {
        const { username, email, fullName, password } = req.body;
        const userId = req.user.id;
        
        const updates = {};
        
        if (username !== undefined) {
            if (typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 50) {
                return res.status(400).json({ error: 'Имя пользователя должно быть от 3 до 50 символов' });
            }
            
            const cleanUsername = username.trim();
            
            // Проверка на существование
            const { data: existing } = await supabase
                .from('users')
                .select('id')
                .eq('username', cleanUsername)
                .neq('id', userId)
                .single();
                
            if (existing) {
                return res.status(400).json({ error: 'Имя пользователя уже занято' });
            }
            
            updates.username = cleanUsername;
        }
        
        if (email !== undefined) {
            // Смена email требует подтверждения через код, обрабатывается отдельным endpoint
            return res.status(400).json({ error: 'Для смены email используйте /api/profile/change-email' });
        }
        
        if (fullName !== undefined) {
            if (fullName === null || fullName === '') {
                updates.full_name = null;
            } else if (typeof fullName === 'string' && fullName.trim().length <= 100) {
                updates.full_name = fullName.trim() || null;
            } else {
                return res.status(400).json({ error: 'Полное имя должно быть до 100 символов' });
            }
        }
        
        if (password !== undefined) {
            if (typeof password !== 'string' || password.length < 6 || password.length > 100) {
                return res.status(400).json({ error: 'Пароль должен быть от 6 до 100 символов' });
            }
            
            // Проверка на слабые пароли
            if (password.length < 6) {
                return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
            }
            
            // Проверка на слишком простые пароли (опционально)
            if (password === password.toLowerCase() && password.length < 8) {
                // Можно добавить предупреждение, но не блокировать
            }
            
            const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
            updates.password_hash = passwordHash;
        }
        
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }
        
        const { data: updatedUser, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId)
            .select('id, username, email, full_name, is_admin, avatar_url')
            .single();
            
        if (error) throw error;
        
        res.json({
            message: 'Профиль обновлен',
            user: {
                id: updatedUser.id,
                username: updatedUser.username,
                email: updatedUser.email,
                fullName: updatedUser.full_name,
                isAdmin: updatedUser.is_admin,
                avatar_url: updatedUser.avatar_url
            }
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Ошибка обновления профиля' });
    }
});

// Отправка кода для смены email
app.post('/api/profile/change-email', authenticateToken, async (req, res) => {
    try {
        const { email } = req.body;
        const userId = req.user.id;

        if (!email) {
            return res.status(400).json({ error: 'Требуется email' });
        }

        const cleanEmail = email.trim().toLowerCase();

        // Валидация email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanEmail)) {
            return res.status(400).json({ error: 'Неверный формат email' });
        }

        // Проверяем, не используется ли уже этот email другим пользователем
        const { data: existingUser } = await supabase
            .from('users')
            .select('id, email')
            .eq('email', cleanEmail)
            .neq('id', userId)
            .maybeSingle();

        if (existingUser) {
            return res.status(400).json({ error: 'Этот email уже используется другим пользователем' });
        }

        // Проверяем последнюю отправку кода для смены email
        const { data: lastCode } = await supabase
            .from('email_verifications')
            .select('*')
            .eq('user_id', userId)
            .eq('email', cleanEmail)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (lastCode && lastCode.last_sent_at) {
            const diff = Date.now() - new Date(lastCode.last_sent_at).getTime();
            if (diff < RESEND_COOLDOWN_MS) {
                const secondsLeft = Math.ceil((RESEND_COOLDOWN_MS - diff) / 1000);
                return res.status(429).json({
                    error: 'Подождите перед повторной отправкой',
                    message: `Подождите ${secondsLeft} секунд перед повторной отправкой`
                });
            }

            // Удаляем старый код
            await supabase
                .from('email_verifications')
                .delete()
                .eq('id', lastCode.id);
        }

        // Генерируем код
        const code = generateCode();
        const codeHash = await bcrypt.hash(code, 10);

        // Сохраняем код для смены email
        const { error: insertError } = await supabase
            .from('email_verifications')
            .insert([{
                user_id: userId,
                email: cleanEmail,
                code_hash: codeHash,
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                last_sent_at: new Date().toISOString()
            }]);

        if (insertError) {
            console.error('Error saving email change code:', insertError);
            return res.status(500).json({ error: 'Ошибка при создании кода' });
        }

        // Отправляем код
        try {
            await sendVerificationCode(cleanEmail, code);
        } catch (emailError) {
            console.error('Error sending email:', emailError);
            await supabase
                .from('email_verifications')
                .delete()
                .eq('code_hash', codeHash);
            return res.status(500).json({ error: 'Ошибка при отправке кода на email' });
        }

        res.json({
            success: true,
            message: 'Код подтверждения отправлен на новый email'
        });

    } catch (error) {
        console.error('Change email error:', error);
        res.status(500).json({ error: 'Ошибка отправки кода' });
    }
});

// Подтверждение смены email
app.post('/api/profile/confirm-email-change', authenticateToken, async (req, res) => {
    try {
        const { email, code } = req.body;
        const userId = req.user.id;

        if (!email || !code) {
            return res.status(400).json({ error: 'Требуются email и код' });
        }

        const cleanEmail = email.trim().toLowerCase();
        const cleanCode = code.trim();

        // Находим код подтверждения
        const { data: record } = await supabase
            .from('email_verifications')
            .select('*')
            .eq('user_id', userId)
            .eq('email', cleanEmail)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!record) {
            return res.status(400).json({ error: 'Код не найден' });
        }

        if (new Date(record.expires_at) < new Date()) {
            return res.status(400).json({ error: 'Код истёк' });
        }

        const valid = await bcrypt.compare(cleanCode, record.code_hash);
        if (!valid) {
            return res.status(400).json({ error: 'Неверный код' });
        }

        // Обновляем email
        const { data: updatedUser, error: updateError } = await supabase
            .from('users')
            .update({ 
                email: cleanEmail,
                email_verified: true
            })
            .eq('id', userId)
            .select('id, username, email, full_name, is_admin, email_verified')
            .single();

        if (updateError) {
            console.error('Error updating email:', updateError);
            return res.status(500).json({ error: 'Ошибка при обновлении email' });
        }

        // Удаляем использованный код
        await supabase
            .from('email_verifications')
            .delete()
            .eq('id', record.id);

        res.json({
            success: true,
            message: 'Email успешно изменён',
            user: {
                id: updatedUser.id,
                username: updatedUser.username,
                email: updatedUser.email,
                fullName: updatedUser.full_name,
                isAdmin: updatedUser.is_admin,
                emailVerified: updatedUser.email_verified
            }
        });

    } catch (error) {
        console.error('Confirm email change error:', error);
        res.status(500).json({ error: 'Ошибка подтверждения смены email' });
    }
});

// === ВОССТАНОВЛЕНИЕ ПАРОЛЯ ===

// Запрос кода для восстановления пароля
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email, userId } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Требуется email' });
        }
        
        const cleanEmail = email.trim().toLowerCase();
        
        // Валидация email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanEmail)) {
            return res.status(400).json({ error: 'Неверный формат email' });
        }
        
        // Находим все аккаунты с этим email
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('id, username, email')
            .eq('email', cleanEmail);
        
        if (usersError) {
            console.error('Error finding users:', usersError);
            return res.status(500).json({ error: 'Ошибка при поиске пользователей' });
        }
        
        if (!users || users.length === 0) {
            return res.status(404).json({ error: 'Аккаунт с таким email не найден' });
        }
        
        // Если передан userId, используем его, иначе берем первый аккаунт
        let targetUser = userId ? users.find(u => u.id === userId) : users[0];
        if (!targetUser) {
            targetUser = users[0];
        }
        
        // Если несколько аккаунтов и userId не передан, возвращаем список
        if (users.length > 1 && !userId) {
            return res.json({
                success: true,
                accounts: users.map(u => ({
                    id: u.id,
                    username: u.username,
                    email: u.email
                }))
            });
        }
        
        // Проверяем последнюю отправку кода
        const { data: lastCode } = await supabase
            .from('email_verifications')
            .select('*')
            .eq('user_id', targetUser.id)
            .eq('email', cleanEmail)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        if (lastCode && lastCode.last_sent_at) {
            const diff = Date.now() - new Date(lastCode.last_sent_at).getTime();
            if (diff < RESEND_COOLDOWN_MS) {
                const secondsLeft = Math.ceil((RESEND_COOLDOWN_MS - diff) / 1000);
                return res.status(429).json({
                    error: 'Подождите перед повторной отправкой',
                    message: `Подождите ${secondsLeft} секунд перед повторной отправкой`
                });
            }
            
            // Удаляем старый код
            await supabase
                .from('email_verifications')
                .delete()
                .eq('id', lastCode.id);
        }
        
        // Генерируем код
        const code = generateCode();
        const codeHash = await bcrypt.hash(code, 10);
        
        // Сохраняем код
        const { error: insertError } = await supabase
            .from('email_verifications')
            .insert([{
                user_id: targetUser.id,
                email: cleanEmail,
                code_hash: codeHash,
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                last_sent_at: new Date().toISOString()
            }]);
        
        if (insertError) {
            console.error('Error saving reset code:', insertError);
            return res.status(500).json({ error: 'Ошибка при создании кода' });
        }
        
        // Отправляем код
        try {
            await sendVerificationCode(cleanEmail, code);
        } catch (emailError) {
            console.error('Error sending email:', emailError);
            await supabase
                .from('email_verifications')
                .delete()
                .eq('code_hash', codeHash);
            return res.status(500).json({ error: 'Ошибка при отправке кода на email' });
        }
        
        res.json({
            success: true,
            message: 'Код подтверждения отправлен на email',
            userId: targetUser.id
        });
        
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Ошибка отправки кода' });
    }
});

// Подтверждение смены пароля
app.post('/api/reset-password', async (req, res) => {
    try {
        const { email, userId, code, password } = req.body;
        
        if (!email || !userId || !code || !password) {
            return res.status(400).json({ error: 'Требуются email, userId, код и пароль' });
        }
        
        const cleanEmail = email.trim().toLowerCase();
        const cleanCode = code.trim();
        
        // Валидация пароля
        if (typeof password !== 'string' || password.length < 6 || password.length > 100) {
            return res.status(400).json({ error: 'Пароль должен быть от 6 до 100 символов' });
        }
        
        // Находим код подтверждения
        const { data: record } = await supabase
            .from('email_verifications')
            .select('*')
            .eq('user_id', userId)
            .eq('email', cleanEmail)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        if (!record) {
            return res.status(400).json({ error: 'Код не найден' });
        }
        
        if (new Date(record.expires_at) < new Date()) {
            return res.status(400).json({ error: 'Код истёк' });
        }
        
        const valid = await bcrypt.compare(cleanCode, record.code_hash);
        if (!valid) {
            return res.status(400).json({ error: 'Неверный код' });
        }
        
        // Обновляем пароль
        const passwordHash = await bcrypt.hash(password, 10);
        const { data: updatedUser, error: updateError } = await supabase
            .from('users')
            .update({ password_hash: passwordHash })
            .eq('id', userId)
            .select('id, username, email, full_name, is_admin, email_verified')
            .single();
        
        if (updateError) {
            console.error('Error updating password:', updateError);
            return res.status(500).json({ error: 'Ошибка при обновлении пароля' });
        }
        
        // Удаляем использованный код
        await supabase
            .from('email_verifications')
            .delete()
            .eq('id', record.id);
        
        // Создаём JWT токен для автоматического входа
        const token = jwt.sign(
            { 
                id: updatedUser.id, 
                username: updatedUser.username, 
                isAdmin: updatedUser.is_admin 
            },
            JWT_SECRET,
            { expiresIn: TOKEN_EXPIRY }
        );
        
        res.json({
            success: true,
            message: 'Пароль успешно изменён',
            token: token,
            user: {
                id: updatedUser.id,
                username: updatedUser.username,
                email: updatedUser.email,
                fullName: updatedUser.full_name,
                isAdmin: updatedUser.is_admin,
                emailVerified: updatedUser.email_verified
            }
        });
        
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Ошибка смены пароля' });
    }
});

// Загрузка аватара
app.post('/api/profile/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен' });
        }
        
        const userId = req.user.id;
        const fileExtension = path.extname(req.file.originalname);
        const fileName = `avatar_${userId}_${Date.now()}${fileExtension}`;
        
        // Проверка типа файла - поддерживаем любой формат изображения
        if (!req.file.mimetype || !req.file.mimetype.startsWith('image/')) {
            return res.status(400).json({ error: 'Недопустимый тип файла. Разрешены только изображения.' });
        }
        
        // Используем bucket 'product-images' с путем avatars/
        const bucketName = 'product-images';
        const filePath = `avatars/${fileName}`;
        
        const uploadResult = await supabase.storage
            .from(bucketName)
            .upload(filePath, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: true
            });
            
        if (uploadResult.error) {
            console.error('Storage upload error:', uploadResult.error);
            return res.status(500).json({ 
                error: 'Ошибка загрузки в хранилище',
                details: uploadResult.error.message 
            });
        }
        
        console.log('Avatar uploaded successfully to bucket:', bucketName, 'path:', filePath);
        
        // Получаем публичный URL
        const supabaseUrl = process.env.SUPABASE_URL || 'https://peoudeeodcorbigjkxmd.supabase.co';
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${filePath}`;
        
        console.log('Avatar public URL:', publicUrl);
        
        // Обновляем в базе данных
        const { data: updatedUser, error: updateError } = await supabase
            .from('users')
            .update({ avatar_url: publicUrl })
            .eq('id', userId)
            .select('id, username, email, full_name, is_admin, avatar_url')
            .single();
            
        if (updateError) {
            console.error('Database update error:', updateError);
            throw updateError;
        }
        
        res.json({
            message: 'Аватар загружен',
            avatar_url: publicUrl,
            user: {
                id: updatedUser.id,
                username: updatedUser.username,
                email: updatedUser.email,
                fullName: updatedUser.full_name,
                isAdmin: updatedUser.is_admin,
                avatar_url: updatedUser.avatar_url
            }
        });
    } catch (error) {
        console.error('Avatar upload error:', error);
        res.status(500).json({ error: error.message || 'Ошибка загрузки аватара' });
    }
});

// Удаление аккаунта
app.delete('/api/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { password } = req.body;
        
        // Проверка пароля
        if (!password) {
            return res.status(400).json({ error: 'Пароль обязателен для подтверждения' });
        }
        
        // Получаем пользователя из базы данных
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('password_hash')
            .eq('id', userId)
            .single();
            
        if (userError) throw userError;
        
        // Проверяем пароль
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }
        
        // Удаляем пользователя из базы данных
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);
            
        if (error) throw error;
        
        res.json({ message: 'Аккаунт удален' });
    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ error: 'Ошибка удаления аккаунта' });
    }
});

// === КАТЕГОРИИ ===

// Получить все категории
app.get('/api/categories', async (req, res) => {
    try {
        const { data: categories, error } = await supabase
            .from('categories')
            .select('*')
            .order('name');
            
        if (error) throw error;
        
        res.json(categories);
        
    } catch (error) {
        console.error('Categories error:', error);
        res.status(500).json({ error: 'Ошибка загрузки категорий' });
    }
});

// Создать категорию (админ)
app.post('/api/admin/categories', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const { name } = req.body;
        
        // Валидация
        if (!name || typeof name !== 'string') {
            return res.status(400).json({ error: 'Имя категории обязательно' });
        }
        
        const cleanName = name.trim();
        if (cleanName.length < 1 || cleanName.length > 100) {
            return res.status(400).json({ error: 'Имя категории должно быть от 1 до 100 символов' });
        }
        
        const { data: category, error } = await supabase
            .from('categories')
            .insert([{ name: cleanName }])
            .select()
            .single();
            
        if (error) throw error;
        
        res.status(201).json(category);
        
    } catch (error) {
        console.error('Create category error:', error);
        res.status(500).json({ error: 'Ошибка создания категории' });
    }
});

// Обновить категорию (админ)
app.put('/api/admin/categories/:id', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const { name, oldName } = req.body;
        
        // Валидация
        if (!name || typeof name !== 'string') {
            return res.status(400).json({ error: 'Имя категории обязательно' });
        }
        
        const cleanName = name.trim();
        if (cleanName.length < 1 || cleanName.length > 100) {
            return res.status(400).json({ error: 'Имя категории должно быть от 1 до 100 символов' });
        }
        
        // Обновляем категорию в товарах (используем параметризованный запрос)
        const oldCategoryName = oldName || cleanName;
        const { error: updateProductsError } = await supabase
            .from('products')
            .update({ category: cleanName })
            .eq('category', oldCategoryName);
            
        if (updateProductsError) throw updateProductsError;
        
        // Обновляем саму категорию
        const categoryId = parseInt(req.params.id);
        if (isNaN(categoryId)) {
            return res.status(400).json({ error: 'Неверный ID категории' });
        }
        
        const { data: category, error } = await supabase
            .from('categories')
            .update({ name: cleanName })
            .eq('id', categoryId)
            .select()
            .single();
            
        if (error) throw error;
        
        res.json(category);
        
    } catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({ error: 'Ошибка обновления категории' });
    }
});

// Удалить категорию (админ)
app.delete('/api/admin/categories/:id', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const categoryId = parseInt(req.params.id);
        if (isNaN(categoryId)) {
            return res.status(400).json({ error: 'Неверный ID категории' });
        }
        
        // Получаем имя категории перед удалением
        const { data: category } = await supabase
            .from('categories')
            .select('name')
            .eq('id', categoryId)
            .single();
            
        if (category) {
            // Удаляем категорию из товаров (обнуляем поле category)
            const { error: updateProductsError } = await supabase
                .from('products')
                .update({ category: null })
                .eq('category', category.name);
            
        if (updateProductsError) throw updateProductsError;
        
            if (updateProductsError) throw updateProductsError;
        }
        
        // Удаляем саму категорию
        const { error } = await supabase
            .from('categories')
            .delete()
            .eq('id', categoryId);
            
        if (error) throw error;
        
        res.json({ message: 'Категория удалена' });
        
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({ error: 'Ошибка удаления категории' });
    }
});

// === ТОВАРЫ ===

// Получить все товары (с кэшированием и пагинацией)
app.get('/api/products', async (req, res) => {
    try {
        const { featured, page = 1, limit = PRODUCTS_PER_PAGE } = req.query;
        const isFeatured = featured === 'true';
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        // Проверяем кэш
        const cached = getCachedProducts(isFeatured);
        if (cached && pageNum === 1 && limitNum === PRODUCTS_PER_PAGE) {
            // Возвращаем из кэша только если это первая страница с дефолтным лимитом
            return res.json({
                products: cached.slice(0, limitNum),
                total: cached.length,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(cached.length / limitNum),
                cached: true
            });
        }

        let query = supabase.from('products').select('*', { count: 'exact' });

        if (isFeatured) {
            query = query.eq('featured', true);
        }

        // Применяем пагинацию
        query = query.range(offset, offset + limitNum - 1);
        query = query.order('created_at', { ascending: false });

        const { data: products, error, count } = await query;

        if (error) throw error;

        // Добавляем полные URL изображений
        const supabaseUrl = process.env.SUPABASE_URL || 'https://peoudeeodcorbigjkxmd.supabase.co';
        const productsWithImages = products.map(product => {
            let imageUrl = null;
            
            // Если есть image_url и это уже полный URL (начинается с http), используем его как есть
            if (product.image_url && product.image_url.trim() !== '' && product.image_url.trim().startsWith('http')) {
                imageUrl = product.image_url.trim();
            } 
            // Если есть image_path, формируем URL
            else if (product.image_path && product.image_path.trim() !== '') {
                const imagePath = product.image_path.trim();
                // Убираем лишние слэши
                let cleanPath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;
                
                // Если путь уже содержит полный URL, извлекаем только путь
                if (cleanPath.includes('storage/v1/object/public/')) {
                    const match = cleanPath.match(/storage\/v1\/object\/public\/[^\/]+\/(.+)$/);
                    if (match) {
                        cleanPath = match[1];
                    }
                }
                
                // Если путь не начинается с products/ или avatars/, добавляем products/
                if (!cleanPath.startsWith('products/') && !cleanPath.startsWith('avatars/')) {
                    cleanPath = `products/${cleanPath}`;
                }
                imageUrl = `${supabaseUrl}/storage/v1/object/public/product-images/${cleanPath}`;
            }
            
            return {
                ...product,
                image_url: imageUrl
            };
        });

        // Обновляем кэш только для первой страницы без пагинации
        if (pageNum === 1 && limitNum === PRODUCTS_PER_PAGE) {
            // Получаем все товары для кэша
            const { data: allProducts } = await supabase
                .from('products')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (allProducts) {
                const allWithImages = allProducts.map(product => {
                    let imageUrl = null;
                    if (product.image_url && product.image_url.trim() !== '' && product.image_url.trim().startsWith('http')) {
                        imageUrl = product.image_url.trim();
                    } else if (product.image_path && product.image_path.trim() !== '') {
                        const imagePath = product.image_path.trim();
                        let cleanPath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;
                        if (cleanPath.includes('storage/v1/object/public/')) {
                            const match = cleanPath.match(/storage\/v1\/object\/public\/[^\/]+\/(.+)$/);
                            if (match) cleanPath = match[1];
                        }
                        if (!cleanPath.startsWith('products/') && !cleanPath.startsWith('avatars/')) {
                            cleanPath = `products/${cleanPath}`;
                        }
                        imageUrl = `${supabaseUrl}/storage/v1/object/public/product-images/${cleanPath}`;
                    }
                    return { ...product, image_url: imageUrl };
                });
                setCachedProducts(allWithImages, isFeatured);
            }
        }

        res.json({
            products: productsWithImages,
            total: count || productsWithImages.length,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil((count || productsWithImages.length) / limitNum),
            cached: false
        });

    } catch (error) {
        console.error('Products error:', error);
        res.status(500).json({ error: 'Ошибка загрузки товаров' });
    }
});

// Получить товары для админа
app.get('/api/admin/products', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const { data: products, error } = await supabase
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        const supabaseUrl = process.env.SUPABASE_URL || 'https://peoudeeodcorbigjkxmd.supabase.co';
        const productsWithImages = products.map(product => {
            let imageUrl = null;
            
            // Если есть image_url и это уже полный URL (начинается с http), используем его как есть
            if (product.image_url && product.image_url.trim() !== '' && product.image_url.trim().startsWith('http')) {
                imageUrl = product.image_url.trim();
            } 
            // Если есть image_path, формируем URL
            else if (product.image_path && product.image_path.trim() !== '') {
                const imagePath = product.image_path.trim();
                // Убираем лишние слэши
                let cleanPath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;
                
                // Если путь уже содержит полный URL, извлекаем только путь
                if (cleanPath.includes('storage/v1/object/public/')) {
                    const match = cleanPath.match(/storage\/v1\/object\/public\/[^\/]+\/(.+)$/);
                    if (match) {
                        cleanPath = match[1];
                    }
                }
                
                // Если путь не начинается с products/ или avatars/, добавляем products/
                if (!cleanPath.startsWith('products/') && !cleanPath.startsWith('avatars/')) {
                    cleanPath = `products/${cleanPath}`;
                }
                imageUrl = `${supabaseUrl}/storage/v1/object/public/product-images/${cleanPath}`;
            }
            
            return {
                ...product,
                image_url: imageUrl
            };
        });
        
        res.json(productsWithImages);
        
    } catch (error) {
        console.error('Admin products error:', error);
        res.status(500).json({ error: 'Ошибка загрузки товаров' });
    }
});

// Создать товар (админ)
app.post('/api/admin/products', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const { title, description, price, quantity, category, image_url } = req.body;
        
        // Валидация
        if (!title || typeof title !== 'string' || title.trim().length < 1) {
            return res.status(400).json({ error: 'Название товара обязательно' });
        }
        if (typeof price !== 'number' || price < 0) {
            return res.status(400).json({ error: 'Цена должна быть положительным числом' });
        }
        if (typeof quantity !== 'number' || quantity < 0 || !Number.isInteger(quantity)) {
            return res.status(400).json({ error: 'Количество должно быть неотрицательным целым числом' });
        }
        
        const productData = {
            title: title.trim(),
            description: description ? description.trim() : null,
            price: parseFloat(price),
            quantity: parseInt(quantity),
            category: category ? category.trim() : null
        };
        
        // Если передан image_url, извлекаем из него путь или сохраняем как image_path
        if (image_url && image_url.trim() !== '') {
            const imageUrl = image_url.trim();
            // Если это полный URL, извлекаем путь
            if (imageUrl.includes('storage/v1/object/public/product-images/')) {
                const match = imageUrl.match(/storage\/v1\/object\/public\/product-images\/(.+)$/);
                if (match) {
                    productData.image_path = match[1];
                }
            } else if (imageUrl.startsWith('http')) {
                // Если это другой URL, сохраняем как путь (будет обработан при получении)
                productData.image_path = imageUrl;
            } else {
                // Если это просто путь
                productData.image_path = imageUrl;
            }
        }
        
        const { data: product, error } = await supabase
            .from('products')
            .insert([productData])
            .select('id, title, description, price, quantity, category, image_path, created_at')
            .single();

        if (error) throw error;

        res.status(201).json(product);

    } catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({ error: 'Ошибка создания товара' });
    }
});

// Обновить товар (админ)
app.put('/api/admin/products/:id', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        if (isNaN(productId)) {
            return res.status(400).json({ error: 'Неверный ID товара' });
        }
        
        const { title, description, price, quantity, category, image_url } = req.body;
        const updateData = {};
        
        if (title !== undefined) {
            if (typeof title !== 'string' || title.trim().length < 1) {
                return res.status(400).json({ error: 'Название товара не может быть пустым' });
            }
            updateData.title = title.trim();
        }
        if (description !== undefined) {
            updateData.description = description ? description.trim() : null;
        }
        if (price !== undefined) {
            if (typeof price !== 'number' || price < 0) {
                return res.status(400).json({ error: 'Цена должна быть положительным числом' });
            }
            updateData.price = parseFloat(price);
        }
        if (quantity !== undefined) {
            if (typeof quantity !== 'number' || quantity < 0 || !Number.isInteger(quantity)) {
                return res.status(400).json({ error: 'Количество должно быть неотрицательным целым числом' });
            }
            updateData.quantity = parseInt(quantity);
        }
        if (category !== undefined) {
            updateData.category = category ? category.trim() : null;
        }
        if (image_url !== undefined) {
            if (image_url === null || image_url === '') {
                updateData.image_path = null;
            } else {
                const imageUrl = image_url.trim();
                // Если это полный URL, извлекаем путь
                if (imageUrl.includes('storage/v1/object/public/product-images/')) {
                    const match = imageUrl.match(/storage\/v1\/object\/public\/product-images\/(.+)$/);
                    if (match) {
                        updateData.image_path = match[1];
                    }
                } else if (imageUrl.startsWith('http')) {
                    // Если это другой URL, сохраняем как путь (будет обработан при получении)
                    updateData.image_path = imageUrl;
                } else {
                    // Если это просто путь
                    updateData.image_path = imageUrl;
                }
            }
        }
        
        const { data: product, error } = await supabase
            .from('products')
            .update(updateData)
            .eq('id', productId)
            .select('id, title, description, price, quantity, category, image_path, created_at')
            .single();

        if (error) throw error;

        res.json(product);

    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({ error: 'Ошибка обновления товара' });
    }
});

// Загрузить изображение товара (админ)
app.post('/api/admin/products/:id/upload', authenticateToken, authenticateAdmin, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен' });
        }
        
        const productId = parseInt(req.params.id);
        if (isNaN(productId)) {
            return res.status(400).json({ error: 'Неверный ID товара' });
        }
        
        const fileExtension = path.extname(req.file.originalname);
        const fileName = `product_${productId}_${Date.now()}${fileExtension}`;
        
        // Проверка типа файла - поддерживаем любой формат изображения
        if (!req.file.mimetype || !req.file.mimetype.startsWith('image/')) {
            return res.status(400).json({ error: 'Недопустимый тип файла. Разрешены только изображения.' });
        }
        
        // Используем bucket 'product-images' с путем products/ (как avatars/ для аватаров)
        const bucketName = 'product-images';
        const filePath = `products/${fileName}`;
        
        const uploadResult = await supabase.storage
            .from(bucketName)
            .upload(filePath, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: true
            });
            
        if (uploadResult.error) {
            console.error('Storage upload error:', uploadResult.error);
            return res.status(500).json({ 
                error: 'Ошибка загрузки в хранилище',
                details: uploadResult.error.message 
            });
        }
        
        console.log('Product image uploaded successfully to bucket:', bucketName, 'path:', filePath);
        
        // Получаем публичный URL
        const supabaseUrl = process.env.SUPABASE_URL || 'https://peoudeeodcorbigjkxmd.supabase.co';
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${filePath}`;
        
        console.log('Product image public URL:', publicUrl);
        
        // Обновляем в базе данных (только image_path, image_url формируется динамически)
        const { data: updatedProduct, error: updateError } = await supabase
            .from('products')
            .update({ 
                image_path: filePath
            })
            .eq('id', productId)
            .select('id, title, description, price, quantity, category, image_path, created_at')
            .single();
            
        if (updateError) {
            console.error('Database update error:', updateError);
            return res.status(500).json({ 
                error: 'Ошибка обновления товара',
                details: updateError.message 
            });
        }
        
        res.json({
            message: 'Изображение загружено',
            image_url: publicUrl,
            path: filePath
        });
    } catch (error) {
        console.error('Product image upload error:', error);
        res.status(500).json({ error: error.message || 'Ошибка загрузки изображения' });
    }
});

// Удалить изображение товара (админ)
app.delete('/api/admin/products/:id/image', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const productId = req.params.id;
        
        // Получаем товар для проверки наличия изображения
        const { data: product } = await supabase
            .from('products')
            .select('image_path')
            .eq('id', productId)
            .single();
            
        if (product && product.image_path) {
            // Формируем путь для удаления (добавляем products/ если его нет)
            let imagePath = product.image_path.trim();
            if (!imagePath.startsWith('products/') && !imagePath.startsWith('avatars/')) {
                imagePath = `products/${imagePath}`;
            }
            // Удаляем файл из storage
            await supabase.storage
                .from('product-images')
                .remove([imagePath]);
        }
        
        // Обновляем товар - удаляем ссылки на изображение (только image_path, image_url формируется динамически)
        const { error } = await supabase
            .from('products')
            .update({ 
                image_path: null
            })
            .eq('id', productId);
            
        if (error) throw error;
        
        res.json({ message: 'Изображение удалено' });
        
    } catch (error) {
        console.error('Delete image error:', error);
        res.status(500).json({ error: 'Ошибка удаления изображения' });
    }
});

// Удалить товар (админ)
app.delete('/api/admin/products/:id', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        if (isNaN(productId)) {
            return res.status(400).json({ error: 'Неверный ID товара' });
        }
        
        // Получаем товар для удаления изображения
        const { data: product } = await supabase
            .from('products')
            .select('image_path')
            .eq('id', productId)
            .single();
            
        // Удаляем изображение если есть
        if (product && product.image_path) {
            // Формируем путь для удаления (добавляем products/ если его нет)
            let imagePath = product.image_path.trim();
            if (!imagePath.startsWith('products/') && !imagePath.startsWith('avatars/')) {
                imagePath = `products/${imagePath}`;
            }
            await supabase.storage
                .from('product-images')
                .remove([imagePath]);
        }
        
        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', productId);
            
        if (error) throw error;
        
        res.json({ message: 'Товар удален' });
        
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ error: 'Ошибка удаления товара' });
    }
});

// === АДМИНСКИЕ ЭНДПОИНТЫ ДЛЯ ПОЛЬЗОВАТЕЛЕЙ ===

// Получить всех пользователей (админ)
app.get('/api/admin/users', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, username, email, full_name, is_admin, created_at, avatar_url')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        res.json(users);
        
    } catch (error) {
        console.error('Admin users error:', error);
        res.status(500).json({ error: 'Ошибка загрузки пользователей' });
    }
});

// Получить заказы пользователя (админ)
app.get('/api/admin/users/:id/orders', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                *,
                order_items (
                    *,
                    products (*)
                )
            `)
            .eq('user_id', req.params.id)
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        res.json(orders);
        
    } catch (error) {
        console.error('Admin user orders error:', error);
        res.status(500).json({ error: 'Ошибка загрузки заказов' });
    }
});

// === АДМИНСКИЕ ЭНДПОИНТЫ ДЛЯ ЗАКАЗОВ ===

// Получить все заказы (админ)
app.get('/api/admin/orders', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                *,
                order_items (
                    *,
                    products (*)
                ),
                users (id, username, email)
            `)
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        res.json(orders);
        
    } catch (error) {
        console.error('Admin orders error:', error);
        res.status(500).json({ error: 'Ошибка загрузки заказов' });
    }
});

// Обновить статус заказа (админ)
app.put('/api/admin/orders/:id/status', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        
        // Валидация статуса
        const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Неверный статус заказа' });
        }
        
        const { data: order, error } = await supabase
            .from('orders')
            .update({ status })
            .eq('id', req.params.id)
            .select()
            .single();
            
        if (error) throw error;
        
        res.json(order);
        
    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({ error: 'Ошибка обновления статуса заказа' });
    }
});

// === ЗАКАЗЫ (ОБЩИЕ) ===

// Создать заказ
app.post('/api/orders', authenticateToken, async (req, res) => {
    try {
        const { items, shippingAddress, paymentMethod } = req.body;

        // Валидация
        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'Корзина пуста' });
        }

        // Расчет общей суммы
        const totalAmount = items.reduce((sum, item) => 
            sum + (item.price * item.quantity), 0);

        let order;
        try {
            // Псевдо-транзакция: создаем заказ
            const { data: newOrder, error: orderError } = await supabase
                .from('orders')
                .insert([{
                    user_id: req.user.id,
                    total_amount: totalAmount,
                    shipping_address: shippingAddress,
                    payment_method: paymentMethod,
                    status: 'pending'
                }])
                .select()
                .single();

            if (orderError) throw orderError;
            order = newOrder;

            // Создание элементов заказа
            const orderItems = items.map(item => ({
                order_id: order.id,
                product_id: item.id,
                quantity: item.quantity,
                price_at_time: item.price
            }));

            const { error: itemsError } = await supabase
                .from('order_items')
                .insert(orderItems);

            if (itemsError) throw itemsError;

            // Обновление количества товаров
            for (const item of items) {
                const { error: rpcError } = await supabase.rpc('decrease_product_quantity', {
                    product_id: item.id,
                    amount: item.quantity
                });
                if (rpcError) throw rpcError;
            }

        } catch (error) {
            // Rollback: удаляем заказ если ошибка
            if (order) {
                await supabase.from('orders').delete().eq('id', order.id);
            }
            throw error;
        }

        res.status(201).json(order);

    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ error: error.message || 'Ошибка создания заказа' });
    }
});

// Получить заказы пользователя
app.get('/api/orders', authenticateToken, async (req, res) => {
    try {
        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                *,
                order_items (
                    *,
                    products (*)
                )
            `)
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(orders);

    } catch (error) {
        console.error('Orders error:', error);
        res.status(500).json({ error: 'Ошибка загрузки заказов' });
    }
});

// Получить детальную информацию о заказе
app.get('/api/orders/:id', authenticateToken, async (req, res) => {
    try {
        const orderId = req.params.id;
        
        const { data: order, error } = await supabase
            .from('orders')
            .select(`
                *,
                order_items (
                    *,
                    products (*)
                )
            `)
            .eq('id', orderId)
            .eq('user_id', req.user.id)
            .single();

        if (error) throw error;
        
        if (!order) {
            return res.status(404).json({ error: 'Заказ не найден' });
        }

        res.json(order);

    } catch (error) {
        console.error('Order details error:', error);
        res.status(500).json({ error: 'Ошибка загрузки заказа' });
    }
});

// Обновить заказ (адрес, время доставки)
app.put('/api/orders/:id', authenticateToken, async (req, res) => {
    try {
        const orderId = req.params.id;
        const { shipping_address, delivery_time } = req.body;
        
        // Проверяем, что заказ принадлежит пользователю
        const { data: existingOrder, error: checkError } = await supabase
            .from('orders')
            .select('id, status, user_id')
            .eq('id', orderId)
            .single();
        
        if (checkError || !existingOrder) {
            return res.status(404).json({ error: 'Заказ не найден' });
        }
        
        if (existingOrder.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Нет доступа к этому заказу' });
        }
        
        // Можно обновлять только если заказ в статусе pending
        if (existingOrder.status !== 'pending') {
            return res.status(400).json({ error: 'Можно изменять только заказы со статусом "pending"' });
        }
        
        const updates = {};
        if (shipping_address !== undefined) {
            updates.shipping_address = shipping_address;
        }
        if (delivery_time !== undefined) {
            updates.delivery_time = delivery_time;
        }
        
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }
        
        const { data: updatedOrder, error: updateError } = await supabase
            .from('orders')
            .update(updates)
            .eq('id', orderId)
            .select(`
                *,
                order_items (
                    *,
                    products (*)
                )
            `)
            .single();
        
        if (updateError) throw updateError;
        
        res.json(updatedOrder);

    } catch (error) {
        console.error('Update order error:', error);
        res.status(500).json({ error: 'Ошибка обновления заказа' });
    }
});

// Отменить заказ
app.delete('/api/orders/:id', authenticateToken, async (req, res) => {
    try {
        const orderId = req.params.id;
        
        // Проверяем, что заказ принадлежит пользователю
        const { data: existingOrder, error: checkError } = await supabase
            .from('orders')
            .select('id, status, user_id')
            .eq('id', orderId)
            .single();
        
        if (checkError || !existingOrder) {
            return res.status(404).json({ error: 'Заказ не найден' });
        }
        
        if (existingOrder.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Нет доступа к этому заказу' });
        }
        
        // Можно отменять только если заказ в статусе pending
        if (existingOrder.status !== 'pending') {
            return res.status(400).json({ error: 'Можно отменять только заказы со статусом "pending"' });
        }
        
        // Обновляем статус на cancelled
        const { data: cancelledOrder, error: updateError } = await supabase
            .from('orders')
            .update({ status: 'cancelled' })
            .eq('id', orderId)
            .select()
            .single();
        
        if (updateError) throw updateError;
        
        res.json({ success: true, message: 'Заказ отменён', order: cancelledOrder });

    } catch (error) {
        console.error('Cancel order error:', error);
        res.status(500).json({ error: 'Ошибка отмены заказа' });
    }
});

// === ЗАГРУЗКА ИЗОБРАЖЕНИЙ ===
app.post('/api/upload-image', upload.single('image'), async (req, res) => {
    try {
        console.log('Upload request received');
        console.log('Request body keys:', Object.keys(req.body || {}));
        console.log('Request file:', req.file ? {
            fieldname: req.file.fieldname,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size
        } : 'No file');

        if (!req.file) {
            console.error('No file in request');
            return res.status(400).json({ error: 'Файл не получен' });
        }

        const file = req.file;

        // Проверка типа файла - поддерживаем любой формат изображения
        if (!file.mimetype || !file.mimetype.startsWith('image/')) {
            console.error('Invalid file type:', file.mimetype);
            return res.status(400).json({ error: 'Недопустимый тип файла. Разрешены только изображения.' });
        }

        const fileExt = path.extname(file.originalname) || `.${file.originalname.split('.').pop()}`;
        const fileName = `product-${Date.now()}${fileExt}`;

        console.log('Uploading to Supabase:', fileName);

        // Загрузка в bucket 'product-images' с путем products/ (как avatars/ для аватаров)
        const { data, error } = await supabase.storage
            .from('product-images')
            .upload(`products/${fileName}`, file.buffer, {
                contentType: file.mimetype,
                upsert: false
            });

        if (error) {
            console.error('Supabase upload error:', error);
            return res.status(500).json({ 
                error: 'Ошибка загрузки в Storage',
                details: error.message 
            });
        }

        console.log('Upload successful:', data);

        // Используем переменную окружения для URL, если доступна
        const supabaseUrl = process.env.SUPABASE_URL || 'https://peoudeeodcorbigjkxmd.supabase.co';
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/product-images/products/${fileName}`;

        console.log('Public URL:', publicUrl);

        res.json({ url: publicUrl });

    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ 
            error: 'Ошибка сервера',
            details: err.message 
        });
    }
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`API доступен по адресу: http://localhost:${PORT}/api`);
});
