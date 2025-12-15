// auth.js - Модуль для аутентификации
import { escapeHtml, safeFetch, showLoadingIndicator, hideLoadingIndicator, showToast } from './utils.js';
import { validateEmail, validateLoginForm, isEmail } from './validators.js';

export class AuthModule {
    constructor(shop) {
        this.shop = shop;
        this.currentRegisterStep = 1;
        this.registerData = {
            username: '',
            email: '',
            fullName: '',
            password: ''
        };
        this.pendingVerificationEmail = null;
        this.resendCodeTimer = null;
        this.pendingEmailChange = null;
        this.resendEmailChangeTimer = null;
        this.pendingRegistrationToken = null;
        this.pendingRegistrationUser = null;
        this.isConfirmingCode = false;
        this.pendingResetEmail = null;
        this.pendingResetUserId = null;
        this.pendingResetAccounts = null;
        this.verifiedPassword = null;
        this.verifiedResetCode = null;
        this.resendResetTimer = null;
    }

    openAuthModal() {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.style.display = 'block';
            document.body.style.overflow = 'hidden';
            setTimeout(() => {
                const input = document.getElementById('login-username') || 
                             document.getElementById('register-username');
                if (input) input.focus();
                // Устанавливаем aria-hidden после установки фокуса
                modal.setAttribute('aria-hidden', 'false');
            }, 300);
        }
    }

    closeAuthModal() {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            // Убираем фокус с элементов внутри модального окна перед закрытием
            const activeElement = document.activeElement;
            if (modal.contains(activeElement)) {
                activeElement.blur();
            }
            // Устанавливаем aria-hidden перед закрытием
            modal.setAttribute('aria-hidden', 'true');
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    async login(usernameOrEmail, password) {
        // Валидация формы входа
        const validation = validateLoginForm({ usernameOrEmail, password });
        if (!validation.valid) {
            const firstError = Object.values(validation.errors)[0];
            showToast(firstError, 'error');
            return false;
        }

        try {
            const emailFormat = isEmail(usernameOrEmail);
            
            const response = await safeFetch(`${this.shop.API_BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    username: usernameOrEmail,
                    email: emailFormat ? usernameOrEmail : undefined,
                    password 
                })
            });

            const data = await response.json();

            if (!response.ok) {
                const errorMsg = data?.error || data?.message || 'Ошибка входа';
                showToast(errorMsg, 'error');
                return false;
            }

            this.shop.user = data.user;
            this.shop.token = data.token;

            localStorage.setItem('user', JSON.stringify(data.user));
            localStorage.setItem('token', this.shop.token);

            this.updateAuthUI();
            showToast('Вход выполнен успешно!', 'success');
            this.closeAuthModal();
            
            await this.shop.productsModule.loadProducts(1, false);

            return true;

        } catch (error) {
            let errorMessage = error.message || 'Ошибка входа';
            if (error.data) {
                errorMessage = error.data.error || error.data.message || errorMessage;
            }
            showToast(errorMessage, 'error');
            return false;
        }
    }

    logout() {
        this.shop.user = null;
        this.shop.token = null;

        localStorage.removeItem('user');
        localStorage.removeItem('token');

        this.updateAuthUI();
        showToast('Вы вышли из системы', 'info');
        if (this.shop.profileModule) {
            this.shop.profileModule.closeProfileModal();
        }
    }

    async validateToken() {
        if (!this.shop.token) return false;

        try {
            const response = await safeFetch(`${this.shop.API_BASE_URL}/validate-token`, {
                headers: { 'Authorization': `Bearer ${this.shop.token}` }
            });

            if (!response || !response.ok) {
                // Если токен невалиден, не выходим автоматически - сохраняем сессию
                // Пользователь останется залогинен до явного выхода
                console.warn('Token validation failed, but keeping session');
                return false;
            }

            const data = await response.json();
            if (data.user) {
                this.shop.user = data.user;
                // Обновляем данные в localStorage
                localStorage.setItem('user', JSON.stringify(data.user));
                localStorage.setItem('token', this.shop.token);
                return true;
            }
            
            return false;

        } catch (error) {
            // При ошибке сети не выходим автоматически - сохраняем сессию
            console.warn('Token validation error (network), but keeping session:', error);
            return false;
        }
    }

    updateAuthUI() {
        const authBtn = document.getElementById('auth-btn');
        const profileBtn = document.getElementById('profile-btn');
        const adminBtn = document.getElementById('admin-btn');
        const cartBtn = document.getElementById('cart-btn');

        if (this.shop.user) {
            if (authBtn) authBtn.style.display = 'none';
            if (profileBtn) profileBtn.style.display = 'flex';
            if (adminBtn) adminBtn.style.display = this.shop.user.isAdmin ? 'flex' : 'none';
            if (cartBtn) cartBtn.style.display = 'flex';
            
            if (!this.shop.products || this.shop.products.length === 0) {
                this.shop.productsModule.loadProducts();
            }
        } else {
            if (authBtn) authBtn.style.display = 'flex';
            if (profileBtn) profileBtn.style.display = 'none';
            if (adminBtn) adminBtn.style.display = 'none';
            if (cartBtn) cartBtn.style.display = 'none';
        }
        
        this.shop.productsModule.renderProducts();
    }

    setupAgeVerification() {
        const ageVerified = localStorage.getItem('ageVerified');
        if (ageVerified === 'true') {
            const modal = document.getElementById('age-verification-modal');
            if (modal) modal.style.display = 'none';
            return;
        }
        
        // Убеждаемся, что DOM загружен
        const setupButtons = () => {
            const yesBtn = document.getElementById('age-yes');
            const noBtn = document.getElementById('age-no');
            
            if (yesBtn) {
                // Удаляем старый обработчик, если есть
                yesBtn.replaceWith(yesBtn.cloneNode(true));
                const newYesBtn = document.getElementById('age-yes');
                newYesBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    localStorage.setItem('ageVerified', 'true');
                    const modal = document.getElementById('age-verification-modal');
                    if (modal) {
                        modal.style.display = 'none';
                        document.body.style.overflow = '';
                    }
                });
            }
            
            if (noBtn) {
                // Удаляем старый обработчик, если есть
                noBtn.replaceWith(noBtn.cloneNode(true));
                const newNoBtn = document.getElementById('age-no');
                newNoBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    alert('Доступ к сайту ограничен для лиц младше 18 лет.');
                    window.location.href = 'https://www.google.com';
                });
            }
        };
        
        // Если DOM уже загружен, устанавливаем сразу
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupButtons);
        } else {
            setupButtons();
        }
    }

    // Регистрация - упрощенная версия
    setupRegisterSteps() {
        this.currentRegisterStep = 1;
        this.registerData = {
            username: '',
            email: '',
            fullName: '',
            password: ''
        };
        this.isConfirmingCode = false;
        this.pendingVerificationEmail = null;
        this.pendingRegistrationToken = null;
        this.pendingRegistrationUser = null;
    }

    async checkUsername(username) {
        if (!username || username.trim().length < 3) {
            return { available: false, error: 'Имя пользователя должно быть не менее 3 символов' };
        }
        
        try {
            const response = await safeFetch(`${this.shop.API_BASE_URL}/check-username/${encodeURIComponent(username.trim())}`, {
                showLoading: false
            });
            return await response.json();
        } catch (error) {
            return { available: false, error: 'Ошибка проверки имени пользователя' };
        }
    }

    showFieldError(errorId, message) {
        const errorEl = document.getElementById(errorId);
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }
    }
    
    hideFieldError(errorId) {
        const errorEl = document.getElementById(errorId);
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
        }
    }

    // ========== ФУНКЦИИ РЕГИСТРАЦИИ ==========
    
    async nextRegisterStep() {
        const currentStep = this.currentRegisterStep || 1;
        
        if (currentStep === 1) {
            const username = document.getElementById('register-username')?.value.trim();
            if (!username) {
                this.showFieldError('username-error', 'Введите имя пользователя');
                return;
            }
            
            if (username.length < 3) {
                this.showFieldError('username-error', 'Имя пользователя должно быть не менее 3 символов');
                return;
            }
            
            showLoadingIndicator();
            const checkResult = await this.checkUsername(username);
            hideLoadingIndicator();
            
            if (!checkResult.available) {
                this.showFieldError('username-error', checkResult.error || 'Это имя пользователя уже занято');
                return;
            }
            
            this.registerData.username = username;
            this.hideFieldError('username-error');
        } else if (currentStep === 2) {
            const email = document.getElementById('register-email')?.value.trim();
            if (!email) {
                this.showFieldError('email-error', 'Введите email');
                return;
            }
            
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                this.showFieldError('email-error', 'Неверный формат email');
                return;
            }
            
            this.registerData.email = email;
            this.hideFieldError('email-error');
            
            await this.registerUserWithoutPassword();
            return;
        } else if (currentStep === 4) {
            // Шаг 4 - полное имя (необязательно)
            const fullName = document.getElementById('register-fullname')?.value.trim();
            this.registerData.fullName = fullName || '';
            // Переходим на шаг 5 (пароль)
            this.currentRegisterStep = 5;
            this.updateRegisterStepDisplay();
            return;
        } else if (currentStep === 5) {
            const password = document.getElementById('register-password')?.value;
            const password2 = document.getElementById('register-password2')?.value;
            
            if (!password) {
                this.showFieldError('password-error', 'Введите пароль');
                return;
            }
            
            if (password.length < 6) {
                this.showFieldError('password-error', 'Пароль должен быть не менее 6 символов');
                return;
            }
            
            if (password !== password2) {
                this.showFieldError('password-error', 'Пароли не совпадают');
                return;
            }
            
            this.registerData.password = password;
            this.hideFieldError('password-error');
            return;
        }
        
        if (currentStep < 5) {
            this.currentRegisterStep = currentStep + 1;
            this.updateRegisterStepDisplay();
        }
    }
    
    prevRegisterStep() {
        if (this.currentRegisterStep > 1) {
            this.currentRegisterStep--;
            this.updateRegisterStepDisplay();
        }
    }
    
    skipFullName() {
        this.registerData.fullName = '';
        this.currentRegisterStep = 5;
        this.updateRegisterStepDisplay();
    }

    async completeRegistrationWithPassword() {
        const password = document.getElementById('register-password')?.value;
        const password2 = document.getElementById('register-password2')?.value;
        const passwordError = document.getElementById('password-error');
        const fullName = document.getElementById('register-fullname')?.value.trim() || '';
        
        if (!password) {
            if (passwordError) {
                passwordError.textContent = 'Введите пароль';
                passwordError.style.display = 'block';
            }
            showToast('Введите пароль', 'error');
            return false;
        }
        
        if (password.length < 6) {
            if (passwordError) {
                passwordError.textContent = 'Пароль должен быть не менее 6 символов';
                passwordError.style.display = 'block';
            }
            showToast('Пароль должен быть не менее 6 символов', 'error');
            return false;
        }
        
        if (password !== password2) {
            if (passwordError) {
                passwordError.textContent = 'Пароли не совпадают';
                passwordError.style.display = 'block';
            }
            showToast('Пароли не совпадают', 'error');
            return false;
        }

        if (passwordError) {
            passwordError.textContent = '';
            passwordError.style.display = 'none';
        }

        if (!this.pendingRegistrationToken || !this.pendingRegistrationUser) {
            showToast('Ошибка: данные регистрации не найдены. Начните регистрацию заново', 'error');
            this.setupRegisterSteps();
            this.updateRegisterStepDisplay();
            return false;
        }

        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.shop.API_BASE_URL}/profile`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.pendingRegistrationToken}`
                },
                body: JSON.stringify({ 
                    password: password,
                    fullName: fullName || null
                })
            });

            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                hideLoadingIndicator();
                console.error('[completeRegistrationWithPassword] Error parsing response:', parseError);
                showToast('Ошибка обработки ответа сервера', 'error');
                return false;
            }
            
            hideLoadingIndicator();

            if (!response.ok) {
                const errorMsg = data?.error || data?.message || 'Ошибка завершения регистрации';
                showToast(errorMsg, 'error');
                return false;
            }

            if (data.user) {
                this.shop.user = data.user;
                this.shop.token = this.pendingRegistrationToken;
                localStorage.setItem('user', JSON.stringify(data.user));
                localStorage.setItem('token', this.shop.token);
                this.updateAuthUI();
                showToast('Регистрация завершена! Вы автоматически вошли в аккаунт', 'success');
                this.closeAuthModal();
                await this.shop.productsModule.loadProducts(1, false);
                
                this.setupRegisterSteps();
                this.updateRegisterStepDisplay();
                this.pendingRegistrationToken = null;
                this.pendingRegistrationUser = null;
                this.registerData = {
                    username: '',
                    email: '',
                    fullName: '',
                    password: ''
                };
                return true;
            } else {
                showToast(data.error || 'Ошибка завершения регистрации', 'error');
                return false;
            }
        } catch (error) {
            hideLoadingIndicator();
            let errorMessage = error.message || 'Ошибка завершения регистрации';
            
            if (errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('токен')) {
                errorMessage = 'Сессия истекла. Пользователь может быть уже зарегистрирован. Попробуйте войти.';
                this.setupRegisterSteps();
                this.updateRegisterStepDisplay();
                if (window.showLoginForm) window.showLoginForm();
            }
            
            showToast(errorMessage, 'error');
            return false;
        }
    }

    async registerUserWithoutPassword() {
        try {
            const username = this.registerData.username;
            const email = this.registerData.email;
            
            if (!username || !email) {
                showToast('Заполните все поля', 'error');
                return false;
            }

            showLoadingIndicator();
            let response, data;
            
            try {
                response = await safeFetch(`${this.shop.API_BASE_URL}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, password: 'temp_password_will_be_changed', fullName: null })
                });

                data = await response.json();
            } catch (fetchError) {
                hideLoadingIndicator();
                if (fetchError.message?.includes('400') || fetchError.message?.includes('уже существует')) {
                    this.showFieldError('username-error', 'Пользователь с таким именем уже существует');
                    showToast('Пользователь с таким именем уже существует. Попробуйте войти или используйте другое имя', 'error');
                    this.currentRegisterStep = 1;
                    this.updateRegisterStepDisplay();
                    return false;
                }
                throw fetchError;
            }
            
            hideLoadingIndicator();

            if (!response.ok) {
                const errorMsg = data?.error || data?.message || 'Ошибка регистрации';
                
                if (response.status === 400 || response.status === 409) {
                    if (errorMsg.includes('уже существует') || errorMsg.includes('занято') || errorMsg.includes('duplicate') || errorMsg.includes('unique')) {
                        this.showFieldError('username-error', errorMsg);
                        showToast(errorMsg + '. Попробуйте войти или используйте другое имя', 'error');
                        this.currentRegisterStep = 1;
                        this.updateRegisterStepDisplay();
                        return false;
                    }
                }
                
                showToast(errorMsg, 'error');
                return false;
            }

            if (data.needsCodeConfirmation) {
                this.pendingVerificationEmail = data.email;
                this.pendingRegistrationToken = data.token;
                this.pendingRegistrationUser = data.user;
                this.currentRegisterStep = 3;
                this.updateRegisterStepDisplay();
                const emailEl = document.getElementById('verification-email');
                if (emailEl) {
                    emailEl.textContent = data.email;
                }
                this.startResendCodeTimer();
                showToast('Код подтверждения отправлен на почту', 'success');
                return true;
            }

            showToast(data.error || 'Ошибка регистрации', 'error');
            return false;

        } catch (error) {
            hideLoadingIndicator();
            
            let errorMessage = error.message || 'Ошибка регистрации';
            const errorStatus = error.status;
            const errorData = error.data;
            
            if (errorStatus === 400 || errorStatus === 409 || 
                errorMessage.includes('уже существует') || 
                errorMessage.includes('занято') || 
                errorMessage.includes('duplicate') || 
                errorMessage.includes('unique') ||
                (errorData && (errorData.error?.includes('уже существует') || errorData.error?.includes('занято')))) {
                
                const finalErrorMsg = errorData?.error || errorData?.message || errorMessage || 'Пользователь с таким именем уже существует';
                this.showFieldError('username-error', finalErrorMsg);
                showToast(finalErrorMsg + '. Попробуйте войти или используйте другое имя', 'error');
                this.currentRegisterStep = 1;
                this.updateRegisterStepDisplay();
                return false;
            }
            
            if (errorMessage.includes('Network') || errorMessage.includes('fetch') || errorMessage.includes('сети')) {
                showToast('Ошибка сети. Если регистрация не завершилась, попробуйте войти с вашими данными', 'error');
            } else {
                showToast(errorMessage, 'error');
            }
            return false;
        }
    }
    
    updateRegisterStepDisplay() {
        const steps = document.querySelectorAll('.register-step');
        const currentStep = this.currentRegisterStep || 1;
        
        console.log('[updateRegisterStepDisplay] Current step:', currentStep, 'Total steps:', steps.length);
        
        steps.forEach((step) => {
            const stepNum = parseInt(step.dataset.step) || 0;
            if (stepNum === currentStep) {
                step.classList.add('active');
                step.style.display = 'flex';
                console.log('[updateRegisterStepDisplay] Showing step:', stepNum);
            } else {
                step.classList.remove('active');
                step.style.display = 'none';
            }
        });
        
        this.updateStepIndicator();
        
        // Проверяем, что шаг действительно отображается
        const activeStep = document.querySelector('.register-step.active');
        if (!activeStep || parseInt(activeStep.dataset.step) !== currentStep) {
            console.error('[updateRegisterStepDisplay] Step display mismatch! Expected:', currentStep, 'Got:', activeStep?.dataset.step);
            // Принудительно показываем нужный шаг
            const targetStep = document.querySelector(`.register-step[data-step="${currentStep}"]`);
            if (targetStep) {
                steps.forEach(s => {
                    s.classList.remove('active');
                    s.style.display = 'none';
                });
                targetStep.classList.add('active');
                targetStep.style.display = 'flex';
            }
        }
    }
    
    updateStepIndicator() {
        const currentStep = this.currentRegisterStep || 1;
        const indicators = document.querySelectorAll('.step-indicator');
        
        indicators.forEach((indicator) => {
            indicator.setAttribute('data-current-step', currentStep);
            
            const numbers = indicator.querySelectorAll('.step-number');
            const lines = indicator.querySelectorAll('.step-line');
            
            numbers.forEach((num, i) => {
                const stepNum = i + 1;
                num.classList.remove('active', 'completed');
                
                if (stepNum < currentStep) {
                    num.textContent = '✓';
                    num.classList.add('completed');
                } else if (stepNum === currentStep) {
                    num.textContent = stepNum;
                    num.classList.add('active');
                } else {
                    num.textContent = stepNum;
                }
            });
            
            lines.forEach((line, i) => {
                const stepNum = i + 1;
                line.classList.remove('completed');
                if (stepNum < currentStep) {
                    line.classList.add('completed');
                }
            });
        });
    }

    async confirmEmailCode() {
        if (this.isConfirmingCode) {
            return false;
        }
        
        const codeInput = document.getElementById('register-code');
        const codeError = document.getElementById('code-error');
        
        if (!codeInput) {
            showToast('Ошибка: поле ввода кода не найдено', 'error');
            return false;
        }
        
        // Используем email из pendingVerificationEmail или из pendingRegistrationUser
        const emailToUse = this.pendingVerificationEmail || this.pendingRegistrationUser?.email;
        
        if (!emailToUse) {
            showToast('Ошибка: email не найден. Начните регистрацию заново', 'error');
            this.currentRegisterStep = 2;
            this.updateRegisterStepDisplay();
            return false;
        }

        const code = codeInput.value.trim();
        
        if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
            if (codeError) {
                codeError.textContent = 'Введите 6-значный код';
                codeError.style.display = 'block';
            }
            showToast('Введите 6-значный код', 'error');
            return false;
        }

        if (codeError) {
            codeError.textContent = '';
            codeError.style.display = 'none';
        }

        this.isConfirmingCode = true;
        
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.shop.API_BASE_URL}/confirm-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: emailToUse,
                    code: code
                })
            });

            if (!response) {
                hideLoadingIndicator();
                showToast('Ошибка: нет ответа от сервера', 'error');
                this.isConfirmingCode = false;
                return false;
            }

            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                hideLoadingIndicator();
                console.error('[confirmEmailCode] Error parsing response:', parseError);
                showToast('Ошибка обработки ответа сервера', 'error');
                this.isConfirmingCode = false;
                return false;
            }
            
            hideLoadingIndicator();
            
            console.log('[confirmEmailCode] Response status:', response.status);
            console.log('[confirmEmailCode] Response data:', data);

            if (!response.ok) {
                const errorMsg = data?.error || data?.message || 'Ошибка подтверждения';
                showToast(errorMsg, 'error');
                if (codeError) {
                    codeError.textContent = errorMsg;
                    codeError.style.display = 'block';
                }
                this.isConfirmingCode = false;
                return false;
            }

            // Проверяем успешный ответ - либо data.success, либо наличие token и user
            const isSuccess = data.success || (data.token && data.user);
            
            if (isSuccess && data.token && data.user) {
                // Сохраняем токен и данные пользователя для завершения регистрации
                this.pendingRegistrationToken = data.token;
                this.pendingRegistrationUser = {
                    id: data.user.id,
                    username: data.user.username,
                    email: data.user.email,
                    fullName: data.user.fullName || data.user.full_name || null,
                    isAdmin: data.user.isAdmin || data.user.is_admin || false,
                    emailVerified: data.user.emailVerified !== false && data.user.email_verified !== false
                };
                
                console.log('[confirmEmailCode] Saved registration data:', {
                    hasToken: !!this.pendingRegistrationToken,
                    hasUser: !!this.pendingRegistrationUser,
                    userId: this.pendingRegistrationUser?.id,
                    username: this.pendingRegistrationUser?.username
                });
                
                // Проверяем, что данные сохранились
                if (!this.pendingRegistrationToken || !this.pendingRegistrationUser) {
                    console.error('[confirmEmailCode] Failed to save registration data');
                    showToast('Ошибка: не удалось сохранить данные регистрации', 'error');
                    this.isConfirmingCode = false;
                    return false;
                }
                
                // Переходим на шаг 4 (ввод полного имени)
                this.currentRegisterStep = 4;
                this.updateRegisterStepDisplay();
                
                // Проверяем, что шаг переключился
                setTimeout(() => {
                    const currentStepEl = document.querySelector('.register-step.active');
                    if (!currentStepEl || currentStepEl.dataset.step !== '4') {
                        console.error('[confirmEmailCode] Step transition failed, forcing update');
                        this.updateRegisterStepDisplay();
                    }
                }, 100);
                
                showToast('Email подтверждён! Завершите регистрацию', 'success');
                
                // Очищаем поле кода
                if (codeInput) {
                    codeInput.value = '';
                }
                
                // Очищаем таймер
                if (this.resendCodeTimer) {
                    clearInterval(this.resendCodeTimer);
                    this.resendCodeTimer = null;
                }
                
                // НЕ очищаем pendingVerificationEmail - он может понадобиться
                this.isConfirmingCode = false;
                
                return true;
            } else if (isSuccess && !data.token) {
                // Email подтверждён, но нет токена - значит пользователь уже зарегистрирован
                showToast('Email успешно подтверждён! Теперь можно войти', 'success');
                this.pendingVerificationEmail = null;
                this.isConfirmingCode = false;
                
                // Сбрасываем регистрацию
                this.setupRegisterSteps();
                this.updateRegisterStepDisplay();
                
                if (window.showLoginForm) {
                    window.showLoginForm();
                }
                return true;
            } else {
                // Ошибка подтверждения
                const errorMsg = data.error || data.message || 'Ошибка подтверждения';
                showToast(errorMsg, 'error');
                if (codeError) {
                    codeError.textContent = errorMsg;
                    codeError.style.display = 'block';
                }
                
                this.isConfirmingCode = false;
                
                return false;
            }

        } catch (error) {
            hideLoadingIndicator();
            
            let errorMessage = error.message || 'Ошибка подтверждения';
            
            if (errorMessage.includes('Network') || errorMessage.includes('fetch') || errorMessage.includes('сети')) {
                errorMessage = 'Ошибка сети. Проверьте подключение и попробуйте снова';
            }
            
            if (error.data) {
                errorMessage = error.data.error || error.data.message || errorMessage;
            }
            
            showToast(errorMessage, 'error');
            if (codeError) {
                codeError.textContent = errorMessage;
                codeError.style.display = 'block';
            }
            
            this.isConfirmingCode = false;
            
            return false;
        }
    }

    async resendVerificationCode() {
        if (!this.pendingVerificationEmail) {
            showToast('Ошибка: email не найден. Начните регистрацию заново', 'error');
            this.currentRegisterStep = 2;
            this.updateRegisterStepDisplay();
            return false;
        }

        const resendBtn = document.getElementById('resend-code-btn');
        if (resendBtn && resendBtn.disabled) {
            return false;
        }

        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.shop.API_BASE_URL}/resend-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: this.pendingVerificationEmail
                })
            });

            const data = await response.json();
            hideLoadingIndicator();
            
            if (!response.ok) {
                const errorMsg = data?.error || data?.message || 'Ошибка отправки кода';
                showToast(errorMsg, 'error');
                return false;
            }

            if (data.success) {
                showToast('Новый код отправлен на почту', 'success');
                this.startResendCodeTimer();
                return true;
            } else {
                const errorMsg = data.error || data.message || 'Ошибка отправки кода';
                showToast(errorMsg, 'error');
                return false;
            }

        } catch (error) {
            hideLoadingIndicator();
            
            let errorMessage = error.message || 'Ошибка отправки кода';
            
            if (errorMessage.includes('Network') || errorMessage.includes('fetch') || errorMessage.includes('сети')) {
                errorMessage = 'Ошибка сети. Проверьте подключение и попробуйте снова';
            }
            
            if (error.data) {
                errorMessage = error.data.error || error.data.message || errorMessage;
            }
            
            showToast(errorMessage, 'error');
            return false;
        }
    }

    startResendCodeTimer() {
        const resendBtn = document.getElementById('resend-code-btn');
        if (!resendBtn) return;

        let timer = 60;
        resendBtn.disabled = true;
        resendBtn.textContent = `Отправить код заново (${timer})`;

        if (this.resendCodeTimer) {
            clearInterval(this.resendCodeTimer);
        }

        this.resendCodeTimer = setInterval(() => {
            timer--;
            resendBtn.textContent = `Отправить код заново (${timer})`;

            if (timer <= 0) {
                clearInterval(this.resendCodeTimer);
                this.resendCodeTimer = null;
                resendBtn.textContent = 'Отправить код заново';
                resendBtn.disabled = false;
            }
        }, 1000);
    }

    // ========== ФУНКЦИИ ВОССТАНОВЛЕНИЯ ПАРОЛЯ ==========

    openForgotPasswordModal() {
        const modal = document.getElementById('forgot-password-modal');
        if (!modal) return;
        
        this.closeAuthModal();
        
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        
        // Устанавливаем aria-hidden после открытия
        setTimeout(() => {
            modal.setAttribute('aria-hidden', 'false');
            const emailInput = document.getElementById('forgot-email');
            if (emailInput) emailInput.focus();
        }, 100);
        
        this.resetForgotPasswordForms();
    }
    
    closeForgotPasswordModal() {
        const modal = document.getElementById('forgot-password-modal');
        if (!modal) return;
        
        // Убираем фокус с элементов внутри модального окна перед закрытием
        const activeElement = document.activeElement;
        if (modal.contains(activeElement)) {
            activeElement.blur();
        }
        // Устанавливаем aria-hidden перед закрытием
        modal.setAttribute('aria-hidden', 'true');
        modal.style.display = 'none';
        document.body.style.overflow = '';
        
        this.resetForgotPasswordData();
    }
    
    resetForgotPasswordForms() {
        const forgotForm = document.getElementById('forgot-password-form');
        const verifyPasswordForm = document.getElementById('verify-password-form');
        const selectForm = document.getElementById('select-account-form');
        const verifyCodeForm = document.getElementById('verify-code-form');
        const resetForm = document.getElementById('reset-password-form');
        
        if (forgotForm) forgotForm.style.display = 'block';
        if (verifyPasswordForm) verifyPasswordForm.style.display = 'none';
        if (selectForm) selectForm.style.display = 'none';
        if (verifyCodeForm) verifyCodeForm.style.display = 'none';
        if (resetForm) resetForm.style.display = 'none';
        
        const title = document.getElementById('forgot-password-title');
        const subtitle = document.getElementById('forgot-password-subtitle');
        if (title) title.textContent = 'Восстановление пароля';
        if (subtitle) subtitle.textContent = 'Введите email для восстановления';
        
        this.resetForgotPasswordData();
    }
    
    resetForgotPasswordData() {
        const emailInput = document.getElementById('forgot-email');
        const verifyPasswordInput = document.getElementById('verify-password');
        const codeInput = document.getElementById('reset-code');
        const passwordInput = document.getElementById('reset-password');
        const password2Input = document.getElementById('reset-password2');
        
        if (emailInput) emailInput.value = '';
        if (verifyPasswordInput) verifyPasswordInput.value = '';
        if (codeInput) codeInput.value = '';
        if (passwordInput) passwordInput.value = '';
        if (password2Input) password2Input.value = '';
        
        const errorEls = ['forgot-email-error', 'verify-password-error', 'reset-code-error', 'reset-password-error'];
        errorEls.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = '';
                el.style.display = 'none';
            }
        });
        
        this.pendingResetEmail = null;
        this.pendingResetUserId = null;
        this.pendingResetAccounts = null;
        this.verifiedPassword = null;
        
        if (this.resendResetTimer) {
            clearInterval(this.resendResetTimer);
            this.resendResetTimer = null;
        }
        
        const resendBtn = document.getElementById('resend-reset-code-btn');
        if (resendBtn) {
            resendBtn.textContent = 'Отправить код заново';
            resendBtn.disabled = false;
        }
    }
    
    async sendPasswordResetCode() {
        const emailInput = document.getElementById('forgot-email');
        const errorEl = document.getElementById('forgot-email-error');
        
        if (!emailInput) {
            showToast('Ошибка: поле ввода email не найдено', 'error');
            return false;
        }
        
        const email = emailInput.value.trim();
        
        if (!email) {
            if (errorEl) {
                errorEl.textContent = 'Введите email';
                errorEl.style.display = 'block';
            }
            showToast('Введите email', 'error');
            return false;
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            if (errorEl) {
                errorEl.textContent = 'Неверный формат email';
                errorEl.style.display = 'block';
            }
            showToast('Неверный формат email', 'error');
            return false;
        }
        
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
        }
        
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.shop.API_BASE_URL}/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.toLowerCase() })
            });
            
            const data = await response.json();
            hideLoadingIndicator();
            
            if (!response.ok) {
                const errorMsg = data?.error || data?.message || 'Ошибка отправки кода';
                showToast(errorMsg, 'error');
                if (errorEl) {
                    errorEl.textContent = errorMsg;
                    errorEl.style.display = 'block';
                }
                return false;
            }
            
            // Всегда показываем форму ввода пароля после email (как в регистрации шаг 3)
            this.pendingResetEmail = email.toLowerCase();
            
            if (data.accounts && data.accounts.length > 1) {
                // Несколько аккаунтов - сохраняем список
                this.pendingResetAccounts = data.accounts;
            } else if (data.accounts?.length === 1) {
                // Один аккаунт - сохраняем ID
                this.pendingResetUserId = data.accounts[0].id;
            } else if (data.userId) {
                // Один аккаунт через userId
                this.pendingResetUserId = data.userId;
            }
            
            // Всегда показываем форму ввода пароля
            this.showVerifyPasswordForm();
            return true;
            
            showToast('Ошибка: неожиданный ответ сервера', 'error');
            return false;
        } catch (error) {
            hideLoadingIndicator();
            let errorMessage = error.message || 'Ошибка отправки кода';
            if (error.data) {
                errorMessage = error.data.error || error.data.message || errorMessage;
            }
            showToast(errorMessage, 'error');
            return false;
        }
    }
    
    showVerifyPasswordForm() {
        const forgotForm = document.getElementById('forgot-password-form');
        const verifyPasswordForm = document.getElementById('verify-password-form');
        const selectForm = document.getElementById('select-account-form');
        const verifyCodeForm = document.getElementById('verify-code-form');
        const resetForm = document.getElementById('reset-password-form');
        const title = document.getElementById('forgot-password-title');
        const subtitle = document.getElementById('forgot-password-subtitle');
        
        if (forgotForm) forgotForm.style.display = 'none';
        if (verifyPasswordForm) verifyPasswordForm.style.display = 'block';
        if (selectForm) selectForm.style.display = 'none';
        if (verifyCodeForm) verifyCodeForm.style.display = 'none';
        if (resetForm) resetForm.style.display = 'none';
        if (title) title.textContent = 'Введите пароль';
        if (subtitle) subtitle.textContent = 'Для подтверждения аккаунта';
        
        // Отображаем email
        const emailDisplay = document.getElementById('reset-email-display-password');
        if (emailDisplay && this.pendingResetEmail) {
            emailDisplay.textContent = this.pendingResetEmail;
        }
        
        const passwordInput = document.getElementById('verify-password');
        if (passwordInput) {
            passwordInput.value = '';
            setTimeout(() => passwordInput.focus(), 100);
        }
        
        const errorEl = document.getElementById('verify-password-error');
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
        }
    }
    
    async verifyPasswordForReset() {
        const passwordInput = document.getElementById('verify-password');
        const errorEl = document.getElementById('verify-password-error');
        
        if (!passwordInput) {
            showToast('Ошибка: поле ввода пароля не найдено', 'error');
            return false;
        }
        
        const password = passwordInput.value;
        
        if (!password) {
            if (errorEl) {
                errorEl.textContent = 'Введите пароль';
                errorEl.style.display = 'block';
            }
            showToast('Введите пароль', 'error');
            return false;
        }
        
        try {
            showLoadingIndicator();
            
            let matchedAccounts = [];
            
            // Если есть pendingResetUserId (один аккаунт) - проверяем пароль для него
            if (this.pendingResetUserId && (!this.pendingResetAccounts || this.pendingResetAccounts.length === 0)) {
                // Нужно получить username для этого userId
                try {
                    const userResponse = await safeFetch(`${this.shop.API_BASE_URL}/user/${this.pendingResetUserId}`, {
                        headers: { 'Authorization': `Bearer ${this.shop.token}` }
                    });
                    if (userResponse.ok) {
                        const userData = await userResponse.json();
                        // Проверяем пароль через login
                        const loginResponse = await safeFetch(`${this.shop.API_BASE_URL}/login`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                username: userData.username || this.pendingResetEmail,
                                password: password
                            })
                        });
                        
                        if (loginResponse.ok) {
                            // Пароль верный - отправляем код
                            this.verifiedPassword = password;
                            hideLoadingIndicator();
                            if (errorEl) {
                                errorEl.textContent = '';
                                errorEl.style.display = 'none';
                            }
                            this.showVerifyCodeForm();
                            return true;
                        }
                    }
                } catch (e) {
                    // Ошибка проверки
                }
            } else if (this.pendingResetAccounts && this.pendingResetAccounts.length > 0) {
                // Несколько аккаунтов - проверяем пароль для каждого
                for (const account of this.pendingResetAccounts) {
                    try {
                        const response = await safeFetch(`${this.shop.API_BASE_URL}/login`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                username: account.username,
                                password: password
                            })
                        });
                        
                        if (response.ok) {
                            matchedAccounts.push(account);
                        }
                    } catch (e) {
                        // Пароль не подходит для этого аккаунта
                    }
                }
            } else {
                // Пробуем проверить через email
                try {
                    const loginResponse = await safeFetch(`${this.shop.API_BASE_URL}/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            username: this.pendingResetEmail,
                            password: password
                        })
                    });
                    
                    if (loginResponse.ok) {
                        const loginData = await loginResponse.json();
                        if (loginData.user) {
                            this.pendingResetUserId = loginData.user.id;
                            this.verifiedPassword = password;
                            hideLoadingIndicator();
                            if (errorEl) {
                                errorEl.textContent = '';
                                errorEl.style.display = 'none';
                            }
                            this.showVerifyCodeForm();
                            return true;
                        }
                    }
                } catch (e) {
                    // Ошибка проверки
                }
            }
            
            hideLoadingIndicator();
            
            if (matchedAccounts.length === 0 && !this.pendingResetUserId) {
                if (errorEl) {
                    errorEl.textContent = 'Неверный пароль';
                    errorEl.style.display = 'block';
                }
                showToast('Неверный пароль', 'error');
                return false;
            }
            
            if (errorEl) {
                errorEl.textContent = '';
                errorEl.style.display = 'none';
            }
            
            this.verifiedPassword = password;
            
            // Если один аккаунт - сразу отправляем код
            if (matchedAccounts.length === 1) {
                this.pendingResetUserId = matchedAccounts[0].id;
                this.showVerifyCodeForm();
                return true;
            }
            
            // Если несколько - показываем выбор
            if (matchedAccounts.length > 1) {
                this.pendingResetAccounts = matchedAccounts;
                this.showAccountSelection(matchedAccounts);
                return true;
            }
            
            // Если дошли сюда и есть pendingResetUserId - отправляем код
            if (this.pendingResetUserId) {
                this.showVerifyCodeForm();
                return true;
            }
            
            showToast('Ошибка: не удалось определить аккаунт', 'error');
            return false;
            
        } catch (error) {
            hideLoadingIndicator();
            showToast('Ошибка проверки пароля', 'error');
            return false;
        }
    }
    
    showAccountSelection(accounts) {
        const forgotForm = document.getElementById('forgot-password-form');
        const verifyPasswordForm = document.getElementById('verify-password-form');
        const selectForm = document.getElementById('select-account-form');
        const verifyCodeForm = document.getElementById('verify-code-form');
        const resetForm = document.getElementById('reset-password-form');
        const title = document.getElementById('forgot-password-title');
        const subtitle = document.getElementById('forgot-password-subtitle');
        
        if (forgotForm) forgotForm.style.display = 'none';
        if (verifyPasswordForm) verifyPasswordForm.style.display = 'none';
        if (selectForm) selectForm.style.display = 'block';
        if (verifyCodeForm) verifyCodeForm.style.display = 'none';
        if (resetForm) resetForm.style.display = 'none';
        if (title) title.textContent = 'Выберите аккаунт';
        if (subtitle) subtitle.textContent = 'Выберите аккаунт для восстановления пароля';
        
        const accountsList = document.getElementById('accounts-list');
        if (!accountsList) return;
        
        accountsList.innerHTML = '';
        accounts.forEach((account) => {
            const accountDiv = document.createElement('div');
            accountDiv.className = 'account-item';
            accountDiv.style.cssText = 'padding: 15px; margin-bottom: 10px; background: rgba(255,255,255,0.05); border: 2px solid var(--border-color); border-radius: 10px; cursor: pointer; transition: all 0.3s;';
            accountDiv.innerHTML = `
                <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 5px;">${escapeHtml(account.username)}</div>
                <div style="font-size: 0.9rem; color: var(--text-secondary);">${escapeHtml(account.email)}</div>
            `;
            accountDiv.addEventListener('click', () => {
                this.pendingResetUserId = account.id;
                this.showVerifyCodeForm();
            });
            accountDiv.addEventListener('mouseenter', () => {
                accountDiv.style.borderColor = 'var(--neon-red)';
                accountDiv.style.background = 'rgba(255,0,51,0.1)';
            });
            accountDiv.addEventListener('mouseleave', () => {
                accountDiv.style.borderColor = 'var(--border-color)';
                accountDiv.style.background = 'rgba(255,255,255,0.05)';
            });
            accountsList.appendChild(accountDiv);
        });
    }
    
    backToForgotPassword() {
        this.resetForgotPasswordForms();
    }
    
    backToVerifyPassword() {
        this.showVerifyPasswordForm();
    }
    
    async showVerifyCodeForm() {
        if (!this.pendingResetEmail || !this.pendingResetUserId) {
            showToast('Ошибка: данные не найдены', 'error');
            return;
        }
        
        // Отправляем код
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.shop.API_BASE_URL}/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    email: this.pendingResetEmail,
                    userId: this.pendingResetUserId
                })
            });
            
            const data = await response.json();
            hideLoadingIndicator();
            
            if (!response.ok) {
                const errorMsg = data?.error || data?.message || 'Ошибка отправки кода';
                showToast(errorMsg, 'error');
                return;
            }
            
            if (!data.success) {
                showToast('Ошибка отправки кода', 'error');
                return;
            }
            
            showToast('Код подтверждения отправлен на email', 'success');
            
        } catch (error) {
            hideLoadingIndicator();
            showToast('Ошибка отправки кода', 'error');
            return;
        }
        
        const forgotForm = document.getElementById('forgot-password-form');
        const verifyPasswordForm = document.getElementById('verify-password-form');
        const selectForm = document.getElementById('select-account-form');
        const verifyCodeForm = document.getElementById('verify-code-form');
        const resetForm = document.getElementById('reset-password-form');
        const title = document.getElementById('forgot-password-title');
        const subtitle = document.getElementById('forgot-password-subtitle');
        
        if (forgotForm) forgotForm.style.display = 'none';
        if (verifyPasswordForm) verifyPasswordForm.style.display = 'none';
        if (selectForm) selectForm.style.display = 'none';
        if (verifyCodeForm) verifyCodeForm.style.display = 'block';
        if (resetForm) resetForm.style.display = 'none';
        if (title) title.textContent = 'Подтверждение кода';
        if (subtitle) subtitle.textContent = 'Введите код из email';
        
        const emailDisplay = document.getElementById('reset-email-display');
        if (emailDisplay && this.pendingResetEmail) {
            emailDisplay.textContent = this.pendingResetEmail;
        }
        
        const codeInput = document.getElementById('reset-code');
        if (codeInput) {
            codeInput.value = '';
            setTimeout(() => codeInput.focus(), 100);
        }
        
        const codeError = document.getElementById('reset-code-error');
        if (codeError) {
            codeError.textContent = '';
            codeError.style.display = 'none';
        }
        
        this.startResendResetTimer();
    }
    
    async verifyResetCode() {
        const codeInput = document.getElementById('reset-code');
        const codeError = document.getElementById('reset-code-error');
        
        if (!codeInput) {
            showToast('Ошибка: поле ввода кода не найдено', 'error');
            return false;
        }
        
        if (!this.pendingResetEmail || !this.pendingResetUserId) {
            showToast('Ошибка: данные не найдены. Начните заново', 'error');
            this.resetForgotPasswordForms();
            return false;
        }
        
        const code = codeInput.value.trim();
        
        if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
            if (codeError) {
                codeError.textContent = 'Введите 6-значный код';
                codeError.style.display = 'block';
            }
            showToast('Введите 6-значный код', 'error');
            return false;
        }
        
        try {
            showLoadingIndicator();
            
            // Проверяем код через API reset-password с временным паролем
            // Сервер проверит код и вернет success, если код верный
            const response = await safeFetch(`${this.shop.API_BASE_URL}/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: this.pendingResetEmail,
                    userId: this.pendingResetUserId,
                    code: code,
                    password: 'VERIFY_CODE_ONLY_TEMP'
                })
            });
            
            if (!response) {
                hideLoadingIndicator();
                const errorMsg = 'Ошибка: нет ответа от сервера';
                showToast(errorMsg, 'error');
                if (codeError) {
                    codeError.textContent = errorMsg;
                    codeError.style.display = 'block';
                }
                return false;
            }
            
            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                hideLoadingIndicator();
                const errorMsg = 'Ошибка: неверный ответ от сервера';
                showToast(errorMsg, 'error');
                if (codeError) {
                    codeError.textContent = errorMsg;
                    codeError.style.display = 'block';
                }
                return false;
            }
            
            hideLoadingIndicator();
            
            if (!response.ok || !data.success) {
                const errorMsg = data?.error || data?.message || 'Ошибка проверки кода';
                showToast(errorMsg, 'error');
                if (codeError) {
                    codeError.textContent = errorMsg;
                    codeError.style.display = 'block';
                }
                return false;
            }
            
            // Код верный - сохраняем его и переходим к вводу нового пароля
            this.verifiedResetCode = code;
            if (codeError) {
                codeError.textContent = '';
                codeError.style.display = 'none';
            }
            
            this.showResetPasswordForm();
            return true;
            
        } catch (error) {
            hideLoadingIndicator();
            let errorMessage = error.message || 'Ошибка проверки кода';
            if (error.data) {
                errorMessage = error.data.error || error.data.message || errorMessage;
            }
            showToast(errorMessage, 'error');
            if (codeError) {
                codeError.textContent = errorMessage;
                codeError.style.display = 'block';
            }
            return false;
        }
    }
    
    showResetPasswordForm() {
        const forgotForm = document.getElementById('forgot-password-form');
        const verifyPasswordForm = document.getElementById('verify-password-form');
        const selectForm = document.getElementById('select-account-form');
        const verifyCodeForm = document.getElementById('verify-code-form');
        const resetForm = document.getElementById('reset-password-form');
        const title = document.getElementById('forgot-password-title');
        const subtitle = document.getElementById('forgot-password-subtitle');
        
        if (forgotForm) forgotForm.style.display = 'none';
        if (verifyPasswordForm) verifyPasswordForm.style.display = 'none';
        if (selectForm) selectForm.style.display = 'none';
        if (verifyCodeForm) verifyCodeForm.style.display = 'none';
        if (resetForm) resetForm.style.display = 'block';
        if (title) title.textContent = 'Новый пароль';
        if (subtitle) subtitle.textContent = 'Введите новый пароль';
        
        // Находим username для отображения
        const usernameDisplay = document.getElementById('reset-username-display');
        if (usernameDisplay && this.pendingResetAccounts) {
            const account = this.pendingResetAccounts.find(a => a.id === this.pendingResetUserId);
            if (account) {
                usernameDisplay.textContent = account.username;
            }
        }
        
        const passwordInput = document.getElementById('reset-password');
        const password2Input = document.getElementById('reset-password2');
        if (passwordInput) passwordInput.value = '';
        if (password2Input) password2Input.value = '';
        
        const passwordError = document.getElementById('reset-password-error');
        if (passwordError) {
            passwordError.textContent = '';
            passwordError.style.display = 'none';
        }
        
        if (passwordInput) {
            setTimeout(() => passwordInput.focus(), 100);
        }
    }
    
    backToSelectAccount() {
        if (this.pendingResetAccounts && this.pendingResetAccounts.length > 1) {
            this.showAccountSelection(this.pendingResetAccounts);
        } else {
            this.showVerifyPasswordForm();
        }
    }
    
    backToVerifyCode() {
        this.showVerifyCodeForm();
    }
    
    async confirmPasswordReset() {
        const passwordInput = document.getElementById('reset-password');
        const password2Input = document.getElementById('reset-password2');
        const passwordError = document.getElementById('reset-password-error');
        const codeInput = document.getElementById('reset-code');
        
        if (!passwordInput || !password2Input) {
            showToast('Ошибка: поля не найдены', 'error');
            return false;
        }
        
        if (!this.pendingResetEmail || !this.pendingResetUserId) {
            showToast('Ошибка: данные не найдены. Начните заново', 'error');
            this.resetForgotPasswordForms();
            return false;
        }
        
        const password = passwordInput.value;
        const password2 = password2Input.value;
        const code = this.verifiedResetCode || (codeInput ? codeInput.value.trim() : '');
        
        if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
            showToast('Ошибка: код не найден. Начните заново', 'error');
            this.resetForgotPasswordForms();
            return false;
        }
        
        if (!password || password.length < 6) {
            if (passwordError) {
                passwordError.textContent = 'Пароль должен быть не менее 6 символов';
                passwordError.style.display = 'block';
            }
            showToast('Пароль должен быть не менее 6 символов', 'error');
            return false;
        }
        
        if (password !== password2) {
            if (passwordError) {
                passwordError.textContent = 'Пароли не совпадают';
                passwordError.style.display = 'block';
            }
            showToast('Пароли не совпадают', 'error');
            return false;
        }
        
        if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
            showToast('Ошибка: код не найден. Начните заново', 'error');
            this.resetForgotPasswordForms();
            return false;
        }
        
        const confirmed = await this.showConfirmDialog(
            'Подтвердите изменение пароля',
            'Вы уверены, что хотите изменить пароль?'
        );
        
        if (!confirmed) {
            return false;
        }
        
        if (passwordError) {
            passwordError.textContent = '';
            passwordError.style.display = 'none';
        }
        
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.shop.API_BASE_URL}/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: this.pendingResetEmail,
                    userId: this.pendingResetUserId,
                    code: code,
                    password: password
                })
            });
            
            const data = await response.json();
            hideLoadingIndicator();
            
            if (!response.ok) {
                const errorMsg = data?.error || data?.message || 'Ошибка смены пароля';
                showToast(errorMsg, 'error');
                if (codeError && errorMsg.includes('код')) {
                    codeError.textContent = errorMsg;
                    codeError.style.display = 'block';
                }
                return false;
            }
            
            if (data.success) {
                showToast('Пароль успешно изменён! Выполняется вход...', 'success');
                
                this.closeForgotPasswordModal();
                
                if (data.token && data.user) {
                    this.shop.user = data.user;
                    this.shop.token = data.token;
                    localStorage.setItem('user', JSON.stringify(data.user));
                    localStorage.setItem('token', data.token);
                    this.updateAuthUI();
                    await this.shop.productsModule.loadProducts(1, false);
                } else {
                    setTimeout(() => {
                        this.openAuthModal();
                        if (window.showLoginForm) window.showLoginForm();
                        showToast('Теперь войдите с новым паролем', 'info');
                    }, 2000);
                }
                
                this.resetForgotPasswordData();
                
                return true;
            }
            
            showToast('Ошибка смены пароля', 'error');
            return false;
        } catch (error) {
            hideLoadingIndicator();
            let errorMessage = error.message || 'Ошибка смены пароля';
            if (error.data) {
                errorMessage = error.data.error || error.data.message || errorMessage;
            }
            showToast(errorMessage, 'error');
            return false;
        }
    }
    
    async resendResetCode() {
        if (!this.pendingResetEmail || !this.pendingResetUserId) {
            showToast('Ошибка: данные не найдены', 'error');
            return false;
        }
        
        const resendBtn = document.getElementById('resend-reset-code-btn');
        if (resendBtn && resendBtn.disabled) {
            return false;
        }
        
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.shop.API_BASE_URL}/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    email: this.pendingResetEmail,
                    userId: this.pendingResetUserId
                })
            });
            
            const data = await response.json();
            hideLoadingIndicator();
            
            if (!response.ok) {
                const errorMsg = data?.error || data?.message || 'Ошибка отправки кода';
                showToast(errorMsg, 'error');
                return false;
            }
            
            if (data.success) {
                showToast('Новый код отправлен на email', 'success');
                this.startResendResetTimer();
                return true;
            }
            
            showToast('Ошибка отправки кода', 'error');
            return false;
        } catch (error) {
            hideLoadingIndicator();
            let errorMessage = error.message || 'Ошибка отправки кода';
            if (error.data) {
                errorMessage = error.data.error || error.data.message || errorMessage;
            }
            showToast(errorMessage, 'error');
            return false;
        }
    }
    
    startResendResetTimer() {
        const resendBtn = document.getElementById('resend-reset-code-btn');
        if (!resendBtn) return;
        
        let timer = 60;
        resendBtn.disabled = true;
        resendBtn.textContent = `Отправить код заново (${timer})`;
        
        if (this.resendResetTimer) {
            clearInterval(this.resendResetTimer);
        }
        
        this.resendResetTimer = setInterval(() => {
            timer--;
            resendBtn.textContent = `Отправить код заново (${timer})`;
            
            if (timer <= 0) {
                clearInterval(this.resendResetTimer);
                this.resendResetTimer = null;
                resendBtn.textContent = 'Отправить код заново';
                resendBtn.disabled = false;
            }
        }, 1000);
    }

    // ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

    showConfirmDialog(title, message) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.style.display = 'block';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-hidden', 'false');
            
            const content = document.createElement('div');
            content.className = 'modal-content';
            content.style.maxWidth = '350px';
            content.style.textAlign = 'center';
            
            const titleEl = document.createElement('h3');
            titleEl.textContent = title;
            titleEl.style.marginBottom = '15px';
            titleEl.style.color = '#ff0033';
            
            const messageEl = document.createElement('p');
            messageEl.textContent = message;
            messageEl.style.marginBottom = '25px';
            messageEl.style.color = '#ccc';
            
            const buttonsDiv = document.createElement('div');
            buttonsDiv.style.display = 'flex';
            buttonsDiv.style.gap = '12px';
            
            const noBtn = document.createElement('button');
            noBtn.textContent = 'Нет';
            noBtn.style.cssText = 'flex:1; padding:14px; background:#333; color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;';
            noBtn.addEventListener('click', () => {
                modal.remove();
                resolve(false);
            });
            
            const yesBtn = document.createElement('button');
            yesBtn.textContent = 'Да';
            yesBtn.style.cssText = 'flex:1; padding:14px; background:#ff0033; color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;';
            yesBtn.addEventListener('click', () => {
                modal.remove();
                resolve(true);
            });
            
            buttonsDiv.appendChild(noBtn);
            buttonsDiv.appendChild(yesBtn);
            
            content.appendChild(titleEl);
            content.appendChild(messageEl);
            content.appendChild(buttonsDiv);
            modal.appendChild(content);
            document.body.appendChild(modal);
            
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                    resolve(false);
                }
            });
        });
    }
    
    showInputDialog(title, message, type = 'text', defaultValue = '') {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.style.display = 'block';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-hidden', 'false');
            
            const content = document.createElement('div');
            content.className = 'modal-content';
            content.style.maxWidth = '400px';
            
            const titleEl = document.createElement('h3');
            titleEl.textContent = title;
            titleEl.style.marginBottom = '15px';
            titleEl.style.color = '#ff0033';
            
            const messageEl = document.createElement('p');
            messageEl.textContent = message;
            messageEl.style.marginBottom = '15px';
            messageEl.style.color = '#ccc';
            
            const input = document.createElement('input');
            input.type = type;
            input.value = defaultValue;
            input.style.cssText = 'width:100%; padding:12px; margin:15px 0; border-radius:8px; border:1px solid #333; background:#111; color:white; font-size:1rem;';
            input.placeholder = type === 'password' ? 'Введите пароль...' : 'Введите значение...';
            
            const buttonsDiv = document.createElement('div');
            buttonsDiv.style.display = 'flex';
            buttonsDiv.style.gap = '10px';
            buttonsDiv.style.marginTop = '20px';
            
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Отмена';
            cancelBtn.style.cssText = 'flex:1; padding:12px; background:#333; color:white; border:none; border-radius:8px; cursor:pointer;';
            cancelBtn.addEventListener('click', () => {
                modal.remove();
                resolve(null);
            });
            
            const okBtn = document.createElement('button');
            okBtn.textContent = 'ОК';
            okBtn.style.cssText = 'flex:1; padding:12px; background:#ff0033; color:white; border:none; border-radius:8px; cursor:pointer;';
            okBtn.addEventListener('click', () => {
                const value = input.value.trim();
                modal.remove();
                resolve(value || null);
            });
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    okBtn.click();
                } else if (e.key === 'Escape') {
                    cancelBtn.click();
                }
            });
            
            buttonsDiv.appendChild(cancelBtn);
            buttonsDiv.appendChild(okBtn);
            
            content.appendChild(titleEl);
            content.appendChild(messageEl);
            content.appendChild(input);
            content.appendChild(buttonsDiv);
            modal.appendChild(content);
            document.body.appendChild(modal);
            
            setTimeout(() => input.focus(), 100);
            
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                    resolve(null);
                }
            });
        });
    }
}

