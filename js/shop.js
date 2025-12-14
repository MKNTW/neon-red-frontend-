// shop.js - Основной класс, объединяющий все модули
import { getApiBaseUrl, checkIsMobile, setupSwipeGestures, preventDoubleTapZoom, closeAllModals } from './utils.js';
import { ProductsModule } from './products.js';
import { CartModule } from './cart.js';
import { AuthModule } from './auth.js';
import { ProfileModule } from './profile.js';
import { AdminModule } from './admin.js';

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
        
        const promises = [this.productsModule.loadProducts()];
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
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                closeAllModals();
                this.closeCartModal();
            }
        });
    }

    // Методы для совместимости со старым кодом
    loadProducts(page = 1, useCache = true) {
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
            this.cartModule.renderCart();
        }
    }

    closeCartModal() {
        const modal = document.getElementById('cart-modal');
        if (modal) {
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

    // Делегируем функции профиля
    async saveProfileField(field) {
        const input = document.getElementById(`edit-${field}-input`);
        if (!input) {
            console.error(`Input field not found: edit-${field}-input`);
            return;
        }
        const value = input.value.trim();
        return this.profileModule.updateProfile(field, value);
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
}

// Экспортируем для использования в других модулях
export { NeonShop };
export default NeonShop;

