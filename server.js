// server.js - Бэкенд для NEON RED магазина с админ-панелью
const express = require('express');
const cors = require('cors');
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
const resend = new Resend(process.env.RESEND_API_KEY);

// === ФУНКЦИИ ДЛЯ EMAIL ПОДТВЕРЖДЕНИЯ ===

// Генерация 6-значного кода
function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Отправка кода подтверждения на email
async function sendVerificationCode(email, code) {
    try {
        await resend.emails.send({
            from: 'NEON RED <onboarding@resend.dev>',
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
        return true;
    } catch (error) {
        console.error('Error sending verification code:', error);
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
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Обязательные поля: username, email, password' });
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
        
        // Валидация пароля
        if (typeof password !== 'string' || password.length < 6 || password.length > 100) {
            return res.status(400).json({ error: 'Пароль должен быть от 6 до 100 символов' });
        }
        
        // Очистка данных
        const cleanUsername = username.trim();
        const cleanEmail = email.trim().toLowerCase();

        // Проверка существования пользователя (используем параметризованные запросы)
        const { data: existingUserByUsername, error: usernameError } = await supabase
            .from('users')
            .select('id')
            .eq('username', cleanUsername)
            .maybeSingle();
            
        const { data: existingUserByEmail, error: emailError } = await supabase
            .from('users')
            .select('id')
            .eq('email', cleanEmail)
            .maybeSingle();
            
        if (usernameError || emailError) {
            console.error('Error checking existing users:', usernameError || emailError);
            throw new Error('Ошибка при проверке существующих пользователей');
        }
            
        const existingUser = existingUserByUsername || existingUserByEmail;

        if (existingUser) {
            return res.status(400).json({ 
                error: 'Пользователь с таким email или username уже существует' 
            });
        }

        // Хэширование пароля
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

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

        if (error) throw error;

        // Генерируем код подтверждения
        const code = generateCode();
        const codeHash = await bcrypt.hash(code, 10);

        // Сохраняем код в таблицу email_verifications
        const { error: codeError } = await supabase
            .from('email_verifications')
            .insert([{
                user_id: user.id,
                code_hash: codeHash,
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 минут
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

        res.status(201).json({
            success: true,
            needsCodeConfirmation: true,
            message: 'Код подтверждения отправлен на почту',
            email: cleanEmail
        });

    } catch (error) {
        console.error('Registration error:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
        });
        res.status(500).json({ 
            error: 'Ошибка регистрации',
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

        // Находим пользователя
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, email_verified')
            .eq('email', cleanEmail)
            .maybeSingle();

        if (userError) {
            console.error('Error finding user:', userError);
            throw new Error('Ошибка при поиске пользователя');
        }

        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        if (user.email_verified) {
            return res.status(400).json({ error: 'Email уже подтверждён' });
        }

        // Находим последний код подтверждения
        const { data: record, error: recordError } = await supabase
            .from('email_verifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (recordError) {
            console.error('Error finding verification code:', recordError);
            throw new Error('Ошибка при поиске кода подтверждения');
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
            console.error('Error updating email_verified:', updateError);
            throw new Error('Ошибка при подтверждении email');
        }

        // Удаляем использованный код
        await supabase
            .from('email_verifications')
            .delete()
            .eq('user_id', user.id);

        res.json({
            success: true,
            message: 'Email успешно подтверждён'
        });

    } catch (error) {
        console.error('Confirm email error:', error);
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

        // Находим пользователя
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, email_verified')
            .eq('email', cleanEmail)
            .maybeSingle();

        if (userError) {
            console.error('Error finding user:', userError);
            throw new Error('Ошибка при поиске пользователя');
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
            console.error('Error checking last code:', lastError);
            throw new Error('Ошибка при проверке последнего кода');
        }

        if (last) {
            const diff = Date.now() - new Date(last.last_sent_at).getTime();
            if (diff < 60000) {
                const secondsLeft = Math.ceil((60000 - diff) / 1000);
                return res.status(429).json({
                    error: 'Подождите перед повторной отправкой',
                    message: `Подождите ${secondsLeft} секунд перед повторной отправкой`
                });
            }

            // Удаляем старый код
            await supabase
                .from('email_verifications')
                .delete()
                .eq('id', last.id);
        }

        // Генерируем новый код
        const code = generateCode();
        const codeHash = await bcrypt.hash(code, 10);

        // Сохраняем новый код
        const { error: insertError } = await supabase
            .from('email_verifications')
            .insert([{
                user_id: user.id,
                code_hash: codeHash,
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                last_sent_at: new Date().toISOString()
            }]);

        if (insertError) {
            console.error('Error saving new code:', insertError);
            throw new Error('Ошибка при создании нового кода');
        }

        // Отправляем код
        try {
            await sendVerificationCode(cleanEmail, code);
        } catch (emailError) {
            console.error('Error sending email:', emailError);
            throw new Error('Ошибка при отправке кода на email');
        }

        res.json({
            success: true,
            message: 'Новый код отправлен на почту'
        });

    } catch (error) {
        console.error('Resend code error:', error);
        res.status(500).json({ 
            error: 'Ошибка отправки кода',
            message: error.message || 'Неизвестная ошибка'
        });
    }
});

// Вход
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Валидация
        if (!username || !password) {
            return res.status(400).json({ error: 'Требуются username и password' });
        }
        
        if (typeof username !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ error: 'Неверный формат данных' });
        }

        // Поиск пользователя (используем параметризованный запрос)
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username.trim())
            .single();

        if (error || !user) {
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
            { expiresIn: '7d' }
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
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (typeof email !== 'string' || !emailRegex.test(email.trim())) {
                return res.status(400).json({ error: 'Неверный формат email' });
            }
            
            const cleanEmail = email.trim().toLowerCase();
            
            // Проверка на существование
            const { data: existing } = await supabase
                .from('users')
                .select('id')
                .eq('email', cleanEmail)
                .neq('id', userId)
                .single();
                
            if (existing) {
                return res.status(400).json({ error: 'Email уже используется' });
            }
            
            updates.email = cleanEmail;
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
            
            const passwordHash = await bcrypt.hash(password, 10);
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

// Получить все товары
app.get('/api/products', async (req, res) => {
    try {
        const { featured } = req.query;
        let query = supabase.from('products').select('*');

        if (featured === 'true') {
            query = query.eq('featured', true);
        }

        const { data: products, error } = await query.order('created_at', { ascending: false });

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

        res.json(productsWithImages);

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
