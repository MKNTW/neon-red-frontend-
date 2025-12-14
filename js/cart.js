// cart.js - Модуль для работы с корзиной
import { escapeHtml, escapeAttr, safeFetch, showLoadingIndicator, hideLoadingIndicator, showToast, closeAllModals } from './utils.js';

export class CartModule {
    constructor(shop) {
        this.shop = shop;
    }

    addToCart(id) {
        const product = this.shop.products.find(p => p.id === id);
        if (!product) return;

        const existing = this.shop.cart.find(i => i.id === id);

        if (existing) {
            if (existing.quantity >= product.quantity) {
                showToast(`Нельзя добавить больше, чем есть в наличии`, 'error');
                return;
            }
            existing.quantity += 1;
            showToast(`+1 × ${product.title}`, 'success', 2000);
        } else {
            this.shop.cart.push({ 
                ...product, 
                quantity: 1 
            });
            showToast(`${product.title} добавлен в корзину!`, 'success', 2500);
        }

        this.saveCart();
        this.updateCartInfo();

        if ('vibrate' in navigator) {
            navigator.vibrate([50, 30, 50]);
        }
    }

    changeQuantity(id, delta) {
        const item = this.shop.cart.find(i => i.id === id);
        if (!item) return;

        const product = this.shop.products.find(p => p.id === id);

        if (delta > 0 && item.quantity >= product.quantity) {
            showToast(`Нельзя добавить больше, чем есть в наличии`, 'error');
            return;
        }

        item.quantity += delta;

        if (item.quantity <= 0) {
            this.removeFromCart(id);
        } else {
            this.saveCart();
            this.updateCartInfo();
            this.renderCart();
        }
    }

    removeFromCart(id) {
        this.shop.cart = this.shop.cart.filter(i => i.id !== id);
        this.saveCart();
        this.updateCartInfo();
        this.renderCart();
        showToast('Товар удалён из корзины', 'info', 2000);
    }

    saveCart() {
        try {
            localStorage.setItem('cart', JSON.stringify(this.shop.cart));
        } catch (e) {
            console.error('Error saving cart:', e);
            showToast('Ошибка сохранения корзины', 'error');
        }
    }

    updateCartInfo() {
        const badge = document.getElementById('cart-badge');
        const total = this.shop.cart.reduce((sum, item) => sum + item.quantity, 0);
        
        if (badge) {
            badge.textContent = total;
            badge.style.display = total > 0 ? 'flex' : 'none';
        }
    }

    renderCart() {
        const cartItems = document.getElementById('cart-items');
        const cartTotalModal = document.getElementById('cart-total-modal');
        
        if (cartItems) cartItems.innerHTML = '';

        if (!this.shop.cart.length) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-state empty-cart';
            emptyDiv.innerHTML = `
                <div class="empty-state-icon empty-cart-icon">🛒</div>
                <h3 class="empty-state-title">Корзина пуста</h3>
                <p class="empty-state-description">
                    Добавьте товары в корзину, чтобы оформить заказ
                </p>
                <div class="empty-state-action">
                    <button class="browse-products-btn" onclick="shop.closeCartModal(); shop.productsModule.loadProducts();">
                        Посмотреть товары
                    </button>
                </div>
            `;
            if (cartItems) cartItems.appendChild(emptyDiv);
            if (cartTotalModal) cartTotalModal.textContent = '0 ₽';
            return;
        }

        let total = 0;

        this.shop.cart.forEach(item => {
            const itemTotal = item.price * item.quantity;
            total += itemTotal;

            const div = document.createElement('div');
            div.className = 'cart-item';
            div.setAttribute('role', 'listitem');

            const img = document.createElement('img');
            img.src = item.image_url || 'https://via.placeholder.com/80';
            img.alt = escapeAttr(item.title);
            img.loading = 'lazy';
            img.width = 70;
            img.height = 70;
            img.onerror = function() { this.src = 'https://via.placeholder.com/80'; };
            
            const content = document.createElement('div');
            content.className = 'cart-item-content';
            
            const h4 = document.createElement('h4');
            h4.textContent = item.title;
            
            const p = document.createElement('p');
            p.textContent = `${parseFloat(item.price).toFixed(2)} ₽ × ${item.quantity} = ${itemTotal.toFixed(2)} ₽`;
            
            content.appendChild(h4);
            content.appendChild(p);
            
            const controls = document.createElement('div');
            controls.className = 'cart-item-controls';
            
            const removeOneBtn = document.createElement('button');
            removeOneBtn.className = 'remove-one';
            removeOneBtn.dataset.id = item.id;
            removeOneBtn.setAttribute('aria-label', 'Уменьшить количество');
            removeOneBtn.textContent = '−';
            
            const quantitySpan = document.createElement('span');
            quantitySpan.style.cssText = 'min-width:30px; text-align:center; font-weight:bold;';
            quantitySpan.textContent = item.quantity;
            
            const addOneBtn = document.createElement('button');
            addOneBtn.className = 'add-one';
            addOneBtn.dataset.id = item.id;
            addOneBtn.setAttribute('aria-label', 'Увеличить количество');
            addOneBtn.textContent = '+';
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-item';
            removeBtn.dataset.id = item.id;
            removeBtn.setAttribute('aria-label', 'Удалить из корзины');
            removeBtn.textContent = '✕';
            
            controls.appendChild(removeOneBtn);
            controls.appendChild(quantitySpan);
            controls.appendChild(addOneBtn);
            controls.appendChild(removeBtn);
            
            div.appendChild(img);
            div.appendChild(content);
            div.appendChild(controls);

            cartItems.appendChild(div);
        });

        if (cartTotalModal) cartTotalModal.textContent = `${total.toFixed(2)} ₽`;

        const cartItemsContainer = document.getElementById('cart-items');
        if (cartItemsContainer) {
            const eventType = this.shop.isMobile ? 'touchend' : 'click';
            cartItemsContainer.addEventListener(eventType, (e) => {
                if (this.shop.isMobile) e.preventDefault();
                
                const btn = e.target.closest('button');
                if (!btn) return;
                
                const id = Number(btn.dataset.id);
                if (isNaN(id)) return;
                
                if (btn.classList.contains('add-one')) {
                    this.changeQuantity(id, 1);
                } else if (btn.classList.contains('remove-one')) {
                    this.changeQuantity(id, -1);
                } else if (btn.classList.contains('remove-item')) {
                    this.removeFromCart(id);
                }
            }, { once: false });
        }
    }

    clearCart() {
        this.shop.cart = [];
        this.saveCart();
        this.updateCartInfo();
        this.renderCart();
        showToast('Корзина очищена', 'info');
    }

    async checkout() {
        if (!this.shop.cart.length) {
            showToast('Корзина пуста!', 'error', 2500);
            return;
        }

        if (!this.shop.user) {
            showToast('Для оформления заказа войдите в систему', 'error', 3000);
            this.shop.authModule.openAuthModal();
            return;
        }

        let address;
        if (this.shop.isMobile) {
            address = await this.showMobileAddressPrompt();
            if (!address) return;
        } else {
            address = await this.showInputDialog('Адрес доставки', 'Введите адрес доставки:') || 'Не указан';
        }

        await this.processOrder(address);
    }

    showMobileAddressPrompt() {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.style.display = 'block';
            const content = document.createElement('div');
            content.className = 'modal-content';
            content.style.maxWidth = '400px';
            
            const closeBtn = document.createElement('button');
            closeBtn.className = 'close';
            closeBtn.textContent = '×';
            closeBtn.addEventListener('click', () => {
                modal.remove();
                resolve(null);
            });
            
            const title = document.createElement('h3');
            title.textContent = 'Адрес доставки';
            
            const input = document.createElement('input');
            input.type = 'text';
            input.id = 'mobile-address-input';
            input.placeholder = 'Улица, дом, квартира';
            input.style.cssText = 'width:100%; padding:12px; margin:15px 0; border-radius:8px; border:1px solid #333; background:#111; color:white;';
            
            const buttonsDiv = document.createElement('div');
            buttonsDiv.style.cssText = 'display:flex; gap:10px; margin-top:20px;';
            
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Отмена';
            cancelBtn.style.cssText = 'flex:1; padding:12px; background:#333; color:white; border:none; border-radius:8px; cursor:pointer;';
            cancelBtn.addEventListener('click', () => {
                modal.remove();
                resolve(null);
            });
            
            const okBtn = document.createElement('button');
            okBtn.textContent = 'Продолжить';
            okBtn.style.cssText = 'flex:1; padding:12px; background:#ff0033; color:white; border:none; border-radius:8px; cursor:pointer;';
            okBtn.addEventListener('click', () => {
                const address = input.value || 'Не указан';
                modal.remove();
                resolve(address);
            });
            
            buttonsDiv.appendChild(cancelBtn);
            buttonsDiv.appendChild(okBtn);
            
            content.appendChild(closeBtn);
            content.appendChild(title);
            content.appendChild(input);
            content.appendChild(buttonsDiv);
            modal.appendChild(content);

            document.body.appendChild(modal);

            setTimeout(() => {
                const inputEl = modal.querySelector('#mobile-address-input');
                if (inputEl) inputEl.focus();
            }, 100);
        });
    }

    showInputDialog(title, message) {
        return new Promise((resolve) => {
            const input = prompt(message);
            resolve(input);
        });
    }

    async processOrder(shippingAddress) {
        try {
            if (!shippingAddress || shippingAddress.trim() === '') {
                showToast('Введите адрес доставки', 'error');
                return;
            }
            
            showLoadingIndicator();
            
            const orderData = {
                items: this.shop.cart.map(item => ({
                    id: item.id,
                    quantity: item.quantity,
                    price: item.price
                })),
                shippingAddress: shippingAddress.trim(),
                paymentMethod: 'card'
            };

            const response = await safeFetch(`${this.shop.API_BASE_URL}/orders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.shop.token}`
                },
                body: JSON.stringify(orderData)
            });

            const order = await response.json();
            hideLoadingIndicator();

            if (!response.ok) {
                const errorMsg = order?.error || order?.message || 'Ошибка создания заказа';
                showToast(errorMsg, 'error');
                return;
            }

            showToast(`Заказ #${order.id.substring(0, 8)} оформлен!`, 'success', 5000);

            this.shop.cart = [];
            this.saveCart();
            this.updateCartInfo();
            this.renderCart();

            if (this.shop.profileModule) {
                await this.shop.profileModule.loadOrders();
            }

            setTimeout(() => {
                closeAllModals();
            }, 1500);

        } catch (error) {
            hideLoadingIndicator();
            let errorMessage = error.message || 'Ошибка создания заказа';
            if (error.data) {
                errorMessage = error.data.error || error.data.message || errorMessage;
            }
            showToast(errorMessage, 'error');
            console.error('Process order error:', error);
        }
    }
}

