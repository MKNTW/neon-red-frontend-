// validators.js - Модуль валидации для устранения дублирования кода

/**
 * Валидация email
 * @param {string} email - Email для валидации
 * @returns {boolean} - true если email валиден
 */
export function validateEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
}

/**
 * Валидация имени пользователя
 * @param {string} username - Имя пользователя
 * @param {number} minLength - Минимальная длина (по умолчанию 3)
 * @param {number} maxLength - Максимальная длина (по умолчанию 50)
 * @returns {{valid: boolean, error?: string}} - Результат валидации
 */
export function validateUsername(username, minLength = 3, maxLength = 50) {
    if (!username || typeof username !== 'string') {
        return { valid: false, error: 'Имя пользователя обязательно' };
    }
    
    const trimmed = username.trim();
    
    if (trimmed.length < minLength) {
        return { valid: false, error: `Имя пользователя должно быть не менее ${minLength} символов` };
    }
    
    if (trimmed.length > maxLength) {
        return { valid: false, error: `Имя пользователя должно быть не более ${maxLength} символов` };
    }
    
    // Проверка на допустимые символы (латиница, кириллица, цифры, подчеркивание, дефис)
    const usernameRegex = /^[a-zA-Zа-яА-ЯёЁ0-9_-]+$/;
    if (!usernameRegex.test(trimmed)) {
        return { valid: false, error: 'Имя пользователя может содержать только буквы, цифры, подчеркивание и дефис' };
    }
    
    return { valid: true };
}

/**
 * Валидация пароля
 * @param {string} password - Пароль для валидации
 * @param {number} minLength - Минимальная длина (по умолчанию 6)
 * @param {number} maxLength - Максимальная длина (по умолчанию 100)
 * @returns {{valid: boolean, error?: string}} - Результат валидации
 */
export function validatePassword(password, minLength = 6, maxLength = 100) {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Пароль обязателен' };
    }
    
    if (password.length < minLength) {
        return { valid: false, error: `Пароль должен быть не менее ${minLength} символов` };
    }
    
    if (password.length > maxLength) {
        return { valid: false, error: `Пароль должен быть не более ${maxLength} символов` };
    }
    
    return { valid: true };
}

/**
 * Валидация совпадения паролей
 * @param {string} password - Первый пароль
 * @param {string} password2 - Второй пароль для сравнения
 * @returns {{valid: boolean, error?: string}} - Результат валидации
 */
export function validatePasswordMatch(password, password2) {
    if (!password || !password2) {
        return { valid: false, error: 'Оба поля пароля обязательны' };
    }
    
    if (password !== password2) {
        return { valid: false, error: 'Пароли не совпадают' };
    }
    
    return { valid: true };
}

/**
 * Валидация кода подтверждения (6 цифр)
 * @param {string} code - Код для валидации
 * @param {number} length - Длина кода (по умолчанию 6)
 * @returns {{valid: boolean, error?: string}} - Результат валидации
 */
export function validateVerificationCode(code, length = 6) {
    if (!code || typeof code !== 'string') {
        return { valid: false, error: `Введите ${length}-значный код` };
    }
    
    const trimmed = code.trim();
    const codeRegex = new RegExp(`^\\d{${length}}$`);
    
    if (!codeRegex.test(trimmed)) {
        return { valid: false, error: `Код должен состоять из ${length} цифр` };
    }
    
    return { valid: true };
}

/**
 * Валидация полного имени
 * @param {string} fullName - Полное имя
 * @param {number} maxLength - Максимальная длина (по умолчанию 100)
 * @returns {{valid: boolean, error?: string}} - Результат валидации
 */
export function validateFullName(fullName, maxLength = 100) {
    if (!fullName || fullName.trim().length === 0) {
        return { valid: true }; // Полное имя необязательно
    }
    
    if (fullName.trim().length > maxLength) {
        return { valid: false, error: `Полное имя должно быть не более ${maxLength} символов` };
    }
    
    return { valid: true };
}

/**
 * Валидация адреса доставки
 * @param {string} address - Адрес доставки
 * @param {number} minLength - Минимальная длина (по умолчанию 5)
 * @returns {{valid: boolean, error?: string}} - Результат валидации
 */
export function validateAddress(address, minLength = 5) {
    if (!address || typeof address !== 'string') {
        return { valid: false, error: 'Адрес обязателен' };
    }
    
    const trimmed = address.trim();
    
    if (trimmed.length < minLength) {
        return { valid: false, error: `Адрес должен быть не менее ${minLength} символов` };
    }
    
    return { valid: true };
}

/**
 * Комплексная валидация формы регистрации
 * @param {Object} data - Данные формы
 * @param {string} data.username - Имя пользователя
 * @param {string} data.email - Email
 * @param {string} data.password - Пароль
 * @param {string} data.password2 - Подтверждение пароля
 * @param {string} [data.fullName] - Полное имя (необязательно)
 * @returns {{valid: boolean, errors: Object}} - Результат валидации
 */
export function validateRegistrationForm(data) {
    const errors = {};
    let isValid = true;
    
    // Валидация имени пользователя
    const usernameResult = validateUsername(data.username);
    if (!usernameResult.valid) {
        errors.username = usernameResult.error;
        isValid = false;
    }
    
    // Валидация email
    if (!validateEmail(data.email)) {
        errors.email = 'Неверный формат email';
        isValid = false;
    }
    
    // Валидация пароля
    const passwordResult = validatePassword(data.password);
    if (!passwordResult.valid) {
        errors.password = passwordResult.error;
        isValid = false;
    }
    
    // Валидация совпадения паролей
    const passwordMatchResult = validatePasswordMatch(data.password, data.password2);
    if (!passwordMatchResult.valid) {
        errors.password2 = passwordMatchResult.error;
        isValid = false;
    }
    
    // Валидация полного имени (если указано)
    if (data.fullName) {
        const fullNameResult = validateFullName(data.fullName);
        if (!fullNameResult.valid) {
            errors.fullName = fullNameResult.error;
            isValid = false;
        }
    }
    
    return { valid: isValid, errors };
}

/**
 * Комплексная валидация формы входа
 * @param {Object} data - Данные формы
 * @param {string} data.usernameOrEmail - Имя пользователя или email
 * @param {string} data.password - Пароль
 * @returns {{valid: boolean, errors: Object}} - Результат валидации
 */
export function validateLoginForm(data) {
    const errors = {};
    let isValid = true;
    
    if (!data.usernameOrEmail || data.usernameOrEmail.trim().length === 0) {
        errors.usernameOrEmail = 'Введите имя пользователя или email';
        isValid = false;
    }
    
    if (!data.password || data.password.length === 0) {
        errors.password = 'Введите пароль';
        isValid = false;
    }
    
    return { valid: isValid, errors };
}

/**
 * Проверка, является ли строка email
 * @param {string} str - Строка для проверки
 * @returns {boolean} - true если это email
 */
export function isEmail(str) {
    if (!str || typeof str !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str.trim());
}

