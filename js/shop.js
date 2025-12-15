// shop.js - Основной класс, объединяющий все модули
import { getApiBaseUrl, checkIsMobile, setupSwipeGestures, preventDoubleTapZoom, closeAllModals, showToast } from './utils.js';
import { ProductsModule } from './products.js';
import { CartModule } from './cart.js';
import { AuthModule } from './auth.js';
import { ProfileModule } from './profile.js';
import { AdminModule } from './admin.js';
import { setupRealtimeValidation, setupLoginValidation } from './realtime-validation.js';

export class NeonShop {
    constructor() {
        this.cart = JSON.parse(localStorage.getItem('cart')) || [];
        this.products = [];
        this.user = JSON.parse(localStorage.getItem('user')) || null;
        this.token = localStorage.getItem('token') || null;
        this.currentPage = 1;
        this.totalPages = 1;
        this.totalProducts = 0;
        this.productsEventDelegate = false;
        
        this.API_BASE_URL = getApiBaseUrl();
        console.log('API Base URL:', this.API_BASE_URL);

        this.isMobile = checkIsMobile();
        
        // Инициализируем модули
        this.productsModule = new ProductsModule(this);
        this.cartModule = new CartModule(this);
        this.authModule = new AuthModule(this);
        this.profileModule = new ProfileModule(this);
        this.adminModule = new AdminModule(this);
        
        this.init();
    }

    async init() {
        this.authModule.setupAgeVerification();
        
        this.cartModule.updateCartInfo();
        this.authModule.updateAuthUI();
        this.setupEventListeners();
        
        // Всегда загружаем товары из БД без кэша
        const promises = [this.productsModule.loadProducts(1, false)];
        if (this.token) {
            promises.push(this.authModule.validateToken());
        }
        await Promise.all(promises);
        
        this.authModule.updateAuthUI();

        preventDoubleTapZoom();

        if (this.isMobile) {
            setupSwipeGestures(() => {
                closeAllModals();
                this.closeCartModal();
                this.adminModule.closeAdminPanel();
                this.profileModule.closeProfileModal();
                this.authModule.closeAuthModal();
            });
        }
    }

    setupEventListeners() {
        // Кнопки модальных окон
        const authBtn = document.getElementById('auth-btn');
        const profileBtn = document.getElementById('profile-btn');
        const cartBtn = document.getElementById('cart-btn');
        const adminBtn = document.getElementById('admin-btn');

        if (authBtn) {
            authBtn.addEventListener('click', () => this.authModule.openAuthModal());
        }

        if (profileBtn) {
            profileBtn.addEventListener('click', () => this.profileModule.openProfileModal());
        }

        if (cartBtn) {
            cartBtn.addEventListener('click', () => this.openCartModal());
        }

        if (adminBtn) {
            adminBtn.addEventListener('click', () => this.adminModule.openAdminPanel());
        }

        // Обработчики форм админки
        const editProductForm = document.getElementById('edit-product-form');
        if (editProductForm) {
            editProductForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveProduct();
            });
        }

        const addProductForm = document.getElementById('add-product-form');
        if (addProductForm) {
            addProductForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveNewProduct();
            });
        }

        // Настройка обработчиков Enter для всех форм
        this.setupEnterKeyHandlers();

        // Обработчик загрузки аватара
        const avatarInput = document.getElementById('profile-avatar-upload');
        if (avatarInput) {
            avatarInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.handleAvatarUpload(file);
                }
            });
        }

        // Закрытие модальных окон по клику вне области
        // НЕ закрываем модалку проверки возраста при клике вне её
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                // Проверяем, не является ли это модалкой проверки возраста
                if (e.target.id === 'age-verification-modal') {
                    return; // Не закрываем модалку проверки возраста
                }
                closeAllModals();
                this.closeCartModal();
            }
        });
    }

    // Методы для совместимости со старым кодом
    loadProducts(page = 1, useCache = false) {
        // По умолчанию не используем кэш для актуальности данных
        return this.productsModule.loadProducts(page, useCache);
    }

    renderProducts() {
        return this.productsModule.renderProducts();
    }

    addToCart(id) {
        return this.cartModule.addToCart(id);
    }

    openCartModal() {
        const modal = document.getElementById('cart-modal');
        if (modal) {
            modal.style.display = 'block';
            document.body.style.overflow = 'hidden';
            // Устанавливаем aria-hidden после открытия
            setTimeout(() => {
                modal.setAttribute('aria-hidden', 'false');
            }, 0);
            this.cartModule.renderCart();
        }
    }

    closeCartModal() {
        const modal = document.getElementById('cart-modal');
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

    openAuthModal() {
        return this.authModule.openAuthModal();
    }

    closeAuthModal() {
        return this.authModule.closeAuthModal();
    }

    openProfileModal() {
        return this.profileModule.openProfileModal();
    }

    closeProfileModal() {
        return this.profileModule.closeProfileModal();
    }

    openAdminPanel() {
        return this.adminModule.openAdminPanel();
    }

    closeAdminPanel() {
        return this.adminModule.closeAdminPanel();
    }

    updateAuthUI() {
        return this.authModule.updateAuthUI();
    }

    updateCartInfo() {
        return this.cartModule.updateCartInfo();
    }

    renderCart() {
        return this.cartModule.renderCart();
    }

    async checkout() {
        return this.cartModule.checkout();
    }

    async login(usernameOrEmail, password) {
        return this.authModule.login(usernameOrEmail, password);
    }

    logout() {
        return this.authModule.logout();
    }

    // Делегируем функции регистрации
    async nextRegisterStep() {
        return this.authModule.nextRegisterStep();
    }

    async prevRegisterStep() {
        return this.authModule.prevRegisterStep();
    }

    async confirmEmailCode() {
        return this.authModule.confirmEmailCode();
    }

    async resendVerificationCode() {
        return this.authModule.resendVerificationCode();
    }

    async skipFullName() {
        return this.authModule.skipFullName();
    }

    async completeRegistrationWithPassword() {
        return this.authModule.completeRegistrationWithPassword();
    }

    // Делегируем функции восстановления пароля
    openForgotPasswordModal() {
        return this.authModule.openForgotPasswordModal();
    }

    closeForgotPasswordModal() {
        return this.authModule.closeForgotPasswordModal();
    }

    async sendPasswordResetCode() {
        return this.authModule.sendPasswordResetCode();
    }

    async confirmPasswordReset() {
        return this.authModule.confirmPasswordReset();
    }

    async resendResetCode() {
        return this.authModule.resendResetCode();
    }

    async verifyPasswordForReset() {
        return this.authModule.verifyPasswordForReset();
    }

    async verifyResetCode() {
        return this.authModule.verifyResetCode();
    }

    backToForgotPassword() {
        return this.authModule.backToForgotPassword();
    }

    backToVerifyPassword() {
        return this.authModule.backToVerifyPassword();
    }

    backToSelectAccount() {
        return this.authModule.backToSelectAccount();
    }

    // Делегируем функции профиля
    async saveProfileField(field) {
        const input = document.getElementById(`edit-${field}-input`);
        if (!input) {
            console.error(`Input field not found: edit-${field}-input`);
            return;
        }
        
        let value = input.value.trim();
        
        // Специальная обработка для пароля
        if (field === 'password') {
            const confirmInput = document.getElementById('edit-password-confirm');
            if (!confirmInput) {
                showToast('Поле подтверждения пароля не найдено', 'error');
                return;
            }
            
            const confirmValue = confirmInput.value.trim();
            
            if (!value) {
                showToast('Введите новый пароль', 'error');
                return;
            }
            
            if (value.length < 6) {
                showToast('Пароль должен содержать минимум 6 символов', 'error');
                return;
            }
            
            if (value !== confirmValue) {
                showToast('Пароли не совпадают', 'error');
                return;
            }
        }
        
        // Проверка на пустое значение для других полей
        if (!value && field !== 'fullname') {
            showToast('Поле не может быть пустым', 'error');
            return;
        }
        
        try {
            await this.profileModule.updateProfile(field, value);
            
            // Закрываем форму после успешного сохранения
            const form = document.getElementById(`edit-${field}-form`);
            if (form) {
                form.style.display = 'none';
            }
            
            // Очищаем поля ввода
            if (input) input.value = '';
            if (field === 'password') {
                const confirmInput = document.getElementById('edit-password-confirm');
                if (confirmInput) confirmInput.value = '';
            }
        } catch (error) {
            console.error('Error saving profile field:', error);
        }
    }

    async changeEmail() {
        return this.profileModule.changeEmail();
    }

    async confirmEmailChange() {
        return this.profileModule.confirmEmailChange();
    }

    async resendEmailChangeCode() {
        return this.profileModule.resendEmailChangeCode();
    }

    cancelEmailChange() {
        return this.profileModule.cancelEmailChange();
    }

    async deleteAccount() {
        return this.profileModule.deleteAccount();
    }

    async handleAvatarUpload(file) {
        return this.profileModule.handleAvatarUpload(file);
    }

    async showOrderDetails(order) {
        return this.profileModule.showOrderDetails(order);
    }

    async updateOrderAddress(orderId, newAddress) {
        return this.profileModule.updateOrderAddress(orderId, newAddress);
    }

    async cancelOrder(orderId) {
        return this.profileModule.cancelOrder(orderId);
    }

    // Делегируем функции админки
    async editProduct(id) {
        return this.adminModule.editProduct(id);
    }

    async saveProduct() {
        return this.adminModule.saveProduct();
    }

    async addNewProduct() {
        return this.adminModule.addNewProduct();
    }

    async saveNewProduct() {
        return this.adminModule.saveNewProduct();
    }

    closeEditProductModal() {
        return this.adminModule.closeEditProductModal();
    }

    closeAddProductModal() {
        return this.adminModule.closeAddProductModal();
    }

    async loadAdminUsers() {
        return this.adminModule.loadAdminUsers();
    }

    async loadAdminOrders() {
        return this.adminModule.loadAdminOrders();
    }

    setupEnterKeyHandlers() {
        // Используем делегирование событий для всех форм
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            
            const target = e.target;
            if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA')) return;
            
            // Предотвращаем стандартное поведение
            e.preventDefault();
            
            // Форма входа
            if (target.id === 'login-username') {
                const loginPassword = document.getElementById('login-password');
                if (loginPassword) {
                    loginPassword.focus();
                }
                return;
            }
            
            if (target.id === 'login-password') {
                const loginForm = document.getElementById('login-form');
                if (loginForm) {
                    const submitBtn = loginForm.querySelector('button[type="submit"]');
                    if (submitBtn) submitBtn.click();
                }
                return;
            }

            // Форма регистрации - шаг 1 (имя пользователя)
            if (target.id === 'register-username') {
                this.nextRegisterStep();
                return;
            }
            
            // Форма регистрации - шаг 2 (email)
            if (target.id === 'register-email') {
                this.nextRegisterStep();
                return;
            }
            
            // Форма регистрации - шаг 3 (код подтверждения)
            if (target.id === 'register-code') {
                this.confirmEmailCode();
                return;
            }
            
            // Форма регистрации - шаг 4 (полное имя)
            if (target.id === 'register-fullname') {
                this.nextRegisterStep();
                return;
            }
            
            // Форма регистрации - шаг 5 (пароль)
            if (target.id === 'register-password') {
                const registerPassword2 = document.getElementById('register-password2');
                if (registerPassword2) {
                    registerPassword2.focus();
                }
                return;
            }
            
            if (target.id === 'register-password2') {
                this.completeRegistrationWithPassword();
                return;
            }
            
            // Форма восстановления пароля - email
            if (target.id === 'forgot-email') {
                this.sendPasswordResetCode();
                return;
            }
            
            // Форма восстановления пароля - проверка пароля
            if (target.id === 'verify-password') {
                this.authModule.verifyPasswordForReset();
                return;
            }
            
            // Форма восстановления пароля - код
            if (target.id === 'reset-code') {
                this.authModule.verifyResetCode();
                return;
            }
            
            // Форма восстановления пароля - новый пароль
            if (target.id === 'reset-password') {
                const resetPassword2 = document.getElementById('reset-password2');
                if (resetPassword2) {
                    resetPassword2.focus();
                }
                return;
            }
            
            if (target.id === 'reset-password2') {
                this.confirmPasswordReset();
                return;
            }
            
            // Формы профиля
            if (target.id === 'edit-username-input') {
                saveProfileField('username');
                return;
            }
            
            if (target.id === 'edit-email-input') {
                saveProfileField('email');
                return;
            }
            
            if (target.id === 'edit-fullname-input') {
                saveProfileField('fullName');
                return;
            }
            
            if (target.id === 'edit-password-input') {
                const password2 = document.getElementById('edit-password2-input');
                if (password2) {
                    password2.focus();
                } else {
                    saveProfileField('password');
                }
                return;
            }
            
            if (target.id === 'edit-password2-input') {
                saveProfileField('password');
                return;
            }
            
            // Админские формы
            if (target.id === 'edit-product-title' || 
                target.id === 'edit-product-price' || 
                target.id === 'edit-product-quantity' ||
                target.id === 'edit-product-image-url') {
                const form = document.getElementById('edit-product-form');
                const submitBtn = form?.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.click();
                return;
            }
            
            if (target.id === 'edit-product-description') {
                // Для textarea - Shift+Enter = новая строка, Enter = submit
                if (e.shiftKey) {
                    // Разрешаем Shift+Enter для новой строки
                    return;
                }
                const form = document.getElementById('edit-product-form');
                const submitBtn = form?.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.click();
                return;
            }
            
            if (target.id === 'new-product-title' || 
                target.id === 'new-product-price' || 
                target.id === 'new-product-quantity' ||
                target.id === 'new-product-image') {
                const form = document.getElementById('add-product-form');
                const submitBtn = form?.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.click();
                return;
            }
            
            if (target.id === 'new-product-description') {
                // Для textarea - Shift+Enter = новая строка, Enter = submit
                if (e.shiftKey) {
                    // Разрешаем Shift+Enter для новой строки
                    return;
                }
                const form = document.getElementById('add-product-form');
                const submitBtn = form?.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.click();
                return;
            }
        });
    }

}

// Экспортируем для использования в других модулях
export default NeonShop;

