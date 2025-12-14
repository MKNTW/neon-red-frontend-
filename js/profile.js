// profile.js - Модуль для профиля пользователя
import { escapeHtml, safeFetch, showLoadingIndicator, hideLoadingIndicator, showToast } from './utils.js';

export class ProfileModule {
    constructor(shop) {
        this.shop = shop;
    }

    openProfileModal() {
        if (!this.shop.user) return;

        const modal = document.getElementById('profile-modal');
        if (modal) {
            modal.style.display = 'block';
            document.body.style.overflow = 'hidden';
            this.loadProfileData();
        }
    }

    closeProfileModal() {
        const modal = document.getElementById('profile-modal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    loadProfileData() {
        if (!this.shop.user) return;

        const usernameEl = document.getElementById('profile-username');
        const emailEl = document.getElementById('profile-email');
        const fullNameEl = document.getElementById('profile-fullname');

        if (usernameEl) usernameEl.textContent = this.shop.user.username || 'Не указано';
        if (emailEl) emailEl.textContent = this.shop.user.email || 'Не указано';
        if (fullNameEl) fullNameEl.textContent = this.shop.user.fullName || 'Не указано';
    }

    async loadOrders() {
        if (!this.shop.user) return;

        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.shop.API_BASE_URL}/orders`, {
                headers: { 'Authorization': `Bearer ${this.shop.token}` },
                showLoading: false
            });

            const orders = await response.json();
            this.renderOrders(orders);
            hideLoadingIndicator();
        } catch (error) {
            hideLoadingIndicator();
            console.error('Load orders error:', error);
            const ordersList = document.getElementById('orders-list');
            if (ordersList) {
                ordersList.innerHTML = '<p style="color:#666; text-align:center; padding:20px;">Ошибка загрузки заказов</p>';
            }
        }
    }

    renderOrders(orders) {
        const ordersList = document.getElementById('orders-list');
        if (!ordersList) return;
        
        ordersList.innerHTML = '';
        
        if (!orders || orders.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-state empty-orders';
            emptyDiv.innerHTML = `
                <div class="empty-state-icon">📋</div>
                <h3 class="empty-state-title">Заказов пока нет</h3>
                <p class="empty-state-description">
                    Когда вы оформите заказ, он появится здесь
                </p>
            `;
            ordersList.appendChild(emptyDiv);
            return;
        }

        orders.forEach(order => {
            const orderDiv = document.createElement('div');
            orderDiv.className = 'order-item';
            orderDiv.style.cssText = 'padding: 15px; margin-bottom: 15px; background: rgba(255,255,255,0.05); border: 2px solid var(--border-color); border-radius: 10px; cursor: pointer; transition: all 0.3s;';
            
            orderDiv.addEventListener('click', () => {
                this.showOrderDetails(order);
            });
            
            orderDiv.addEventListener('mouseenter', () => {
                orderDiv.style.borderColor = 'var(--neon-red)';
                orderDiv.style.background = 'rgba(255,0,51,0.1)';
            });
            
            orderDiv.addEventListener('mouseleave', () => {
                orderDiv.style.borderColor = 'var(--border-color)';
                orderDiv.style.background = 'rgba(255,255,255,0.05)';
            });
            
            const orderId = document.createElement('p');
            const strong = document.createElement('strong');
            strong.textContent = `Заказ #${escapeHtml(order.id.substring(0, 8))}`;
            strong.style.color = 'var(--neon-red)';
            orderId.appendChild(strong);
            
            const date = document.createElement('p');
            date.innerHTML = `Дата: ${escapeHtml(new Date(order.created_at).toLocaleDateString('ru-RU'))}`;
            date.style.marginTop = '8px';
            
            const amount = document.createElement('p');
            amount.innerHTML = `Сумма: <strong>${escapeHtml(order.total_amount)} ₽</strong>`;
            amount.style.marginTop = '8px';
            
            const status = document.createElement('p');
            const statusSpan = document.createElement('span');
            statusSpan.textContent = escapeHtml(order.status);
            statusSpan.style.color = '#00ff88';
            status.innerHTML = 'Статус: ';
            status.appendChild(statusSpan);
            status.style.marginTop = '8px';
            
            orderDiv.appendChild(orderId);
            orderDiv.appendChild(date);
            orderDiv.appendChild(amount);
            orderDiv.appendChild(status);
            
            ordersList.appendChild(orderDiv);
        });
    }

    async updateProfile(field, value) {
        try {
            // Маппинг полей для сервера
            const fieldMap = {
                'username': 'username',
                'email': 'email',
                'fullname': 'fullName',
                'password': 'password'
            };
            
            const serverField = fieldMap[field];
            if (!serverField) {
                throw new Error('Неизвестное поле для обновления');
            }
            
            // Проверяем, изменилось ли значение
            const currentValue = this.shop.user[field === 'fullname' ? 'fullName' : field];
            if (value === currentValue || (value === '' && field === 'fullname' && !currentValue)) {
                showToast('Значение не изменилось', 'info');
                return;
            }
            
            const requestBody = { [serverField]: value };
            
            const response = await safeFetch(`${this.shop.API_BASE_URL}/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.shop.token}`
                },
                body: JSON.stringify(requestBody)
            });
            
            const data = await response.json();
            
            if (data.user) {
                this.shop.user = data.user;
                localStorage.setItem('user', JSON.stringify(this.shop.user));
                this.shop.updateAuthUI();
                this.openProfileModal(); // Перезагружаем профиль
                showToast('Профиль обновлен', 'success');
            }
        } catch (error) {
            showToast(error.message || 'Ошибка обновления профиля', 'error');
            console.error('Update profile error:', error);
        }
    }

    async handleAvatarUpload(file) {
        if (!file) return;
        
        // Проверка типа файла
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            showToast('Недопустимый тип файла. Разрешены только изображения.', 'error');
            return;
        }
        
        // Проверка размера файла (макс 5MB для аватара)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            showToast('Файл слишком большой. Максимальный размер: 5MB.', 'error');
            return;
        }
        
        try {
            const formData = new FormData();
            formData.append('avatar', file);
            
            const avatarUrl = `${this.shop.API_BASE_URL}/profile/avatar`;
            
            const response = await safeFetch(avatarUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.shop.token}`
                },
                body: formData
            });
            
            const data = await response.json();
            
            if (data.avatar_url) {
                this.shop.user.avatar_url = data.avatar_url;
                localStorage.setItem('user', JSON.stringify(this.shop.user));
                
                const avatarImg = document.getElementById('profile-avatar-img');
                const avatarText = document.getElementById('profile-avatar-text');
                
                if (avatarImg) {
                    avatarImg.src = data.avatar_url;
                    avatarImg.style.display = 'block';
                }
                if (avatarText) avatarText.style.display = 'none';
                
                showToast('Фото профиля обновлено', 'success');
            } else {
                throw new Error('Сервер не вернул URL аватара');
            }
        } catch (error) {
            console.error('Avatar upload error:', error);
            
            let errorMessage = error.message || 'Ошибка загрузки фото';
            
            if (errorMessage.includes('404') || errorMessage.includes('не найден')) {
                errorMessage = 'Сервер не отвечает. Проверьте, что API сервер запущен на ' + this.shop.API_BASE_URL;
            } else if (errorMessage.includes('401') || errorMessage.includes('авторизация')) {
                errorMessage = 'Требуется авторизация. Пожалуйста, войдите снова.';
            } else if (errorMessage.includes('сети') || errorMessage.includes('fetch')) {
                errorMessage = 'Ошибка сети. Проверьте подключение к интернету.';
            }
            
            showToast(errorMessage, 'error');
        }
    }

    async changeEmail() {
        const emailInput = document.getElementById('edit-email-input');
        const emailForm = document.getElementById('edit-email-form');
        const codeForm = document.getElementById('edit-email-code-form');
        const emailError = document.getElementById('email-code-error');
        
        if (!emailInput) {
            showToast('Ошибка: поле ввода email не найдено', 'error');
            return false;
        }
        
        const newEmail = emailInput.value.trim();
        
        // Валидация email
        if (!newEmail) {
            showToast('Введите новый email', 'error');
            return false;
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail)) {
            showToast('Неверный формат email', 'error');
            return false;
        }
        
        // Проверяем, не совпадает ли с текущим email
        if (this.shop.user && this.shop.user.email && newEmail.toLowerCase() === this.shop.user.email.toLowerCase()) {
            showToast('Это ваш текущий email', 'info');
            return false;
        }
        
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.shop.API_BASE_URL}/profile/change-email`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.shop.token}`
                },
                body: JSON.stringify({ email: newEmail })
            });
            
            const data = await response.json();
            hideLoadingIndicator();
            
            if (!response.ok) {
                const errorMsg = data?.error || data?.message || 'Ошибка отправки кода';
                showToast(errorMsg, 'error');
                return false;
            }
            
            if (data.success) {
                // Сохраняем новый email для подтверждения
                this.shop.authModule.pendingEmailChange = newEmail.toLowerCase();
                
                // Скрываем форму ввода email, показываем форму ввода кода
                if (emailForm) emailForm.style.display = 'none';
                if (codeForm) {
                    codeForm.style.display = 'block';
                    const emailDisplay = document.getElementById('new-email-display');
                    if (emailDisplay) {
                        emailDisplay.textContent = newEmail;
                    }
                    const codeInput = document.getElementById('edit-email-code-input');
                    if (codeInput) {
                        codeInput.value = '';
                    }
                }
                
                // Запускаем таймер для повторной отправки
                this.shop.authModule.startResendEmailChangeTimer();
                
                showToast('Код подтверждения отправлен на новый email', 'success');
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

    async confirmEmailChange() {
        const codeInput = document.getElementById('edit-email-code-input');
        const codeError = document.getElementById('email-code-error');
        const emailForm = document.getElementById('edit-email-form');
        const codeForm = document.getElementById('edit-email-code-form');
        
        if (!codeInput) {
            showToast('Ошибка: поле ввода кода не найдено', 'error');
            return false;
        }
        
        if (!this.shop.authModule.pendingEmailChange) {
            showToast('Ошибка: email не найден. Начните смену email заново', 'error');
            if (emailForm) emailForm.style.display = 'block';
            if (codeForm) codeForm.style.display = 'none';
            return false;
        }
        
        const code = codeInput.value.trim();
        
        // Валидация кода
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
        
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.shop.API_BASE_URL}/profile/confirm-email-change`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.shop.token}`
                },
                body: JSON.stringify({
                    email: this.shop.authModule.pendingEmailChange,
                    code: code
                })
            });
            
            const data = await response.json();
            hideLoadingIndicator();
            
            if (!response.ok) {
                const errorMsg = data?.error || data?.message || 'Ошибка подтверждения';
                showToast(errorMsg, 'error');
                if (codeError) {
                    codeError.textContent = errorMsg;
                    codeError.style.display = 'block';
                }
                return false;
            }
            
            if (data.success && data.user) {
                // Обновляем данные пользователя
                this.shop.user = data.user;
                localStorage.setItem('user', JSON.stringify(this.shop.user));
                this.shop.updateAuthUI();
                
                // Обновляем отображение email в профиле
                const profileEmail = document.getElementById('profile-email');
                if (profileEmail) {
                    profileEmail.textContent = data.user.email;
                }
                const profileEmailHeader = document.getElementById('profile-email-header');
                if (profileEmailHeader) {
                    profileEmailHeader.textContent = data.user.email;
                }
                
                // Скрываем формы
                if (emailForm) emailForm.style.display = 'none';
                if (codeForm) codeForm.style.display = 'none';
                
                // Очищаем поля
                const emailInput = document.getElementById('edit-email-input');
                if (emailInput) emailInput.value = '';
                if (codeInput) codeInput.value = '';
                
                // Очищаем таймер
                if (this.shop.authModule.resendEmailChangeTimer) {
                    clearInterval(this.shop.authModule.resendEmailChangeTimer);
                    this.shop.authModule.resendEmailChangeTimer = null;
                }
                
                // Очищаем pendingEmailChange
                this.shop.authModule.pendingEmailChange = null;
                
                showToast('Email успешно изменён!', 'success');
                return true;
            } else {
                const errorMsg = data.error || data.message || 'Ошибка подтверждения';
                showToast(errorMsg, 'error');
                if (codeError) {
                    codeError.textContent = errorMsg;
                    codeError.style.display = 'block';
                }
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
            return false;
        }
    }

    async resendEmailChangeCode() {
        if (!this.shop.authModule.pendingEmailChange) {
            showToast('Ошибка: email не найден. Начните смену email заново', 'error');
            return false;
        }
        
        const resendBtn = document.getElementById('resend-email-change-btn');
        if (resendBtn && resendBtn.disabled) {
            return false;
        }
        
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.shop.API_BASE_URL}/profile/change-email`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.shop.token}`
                },
                body: JSON.stringify({ email: this.shop.authModule.pendingEmailChange })
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
                this.shop.authModule.startResendEmailChangeTimer();
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

    cancelEmailChange() {
        const emailForm = document.getElementById('edit-email-form');
        const codeForm = document.getElementById('edit-email-code-form');
        const emailInput = document.getElementById('edit-email-input');
        const codeInput = document.getElementById('edit-email-code-input');
        const codeError = document.getElementById('email-code-error');
        
        // Скрываем форму кода, показываем форму email
        if (codeForm) codeForm.style.display = 'none';
        if (emailForm) emailForm.style.display = 'block';
        
        // Очищаем поля
        if (emailInput) emailInput.value = '';
        if (codeInput) codeInput.value = '';
        if (codeError) {
            codeError.textContent = '';
            codeError.style.display = 'none';
        }
        
        // Очищаем таймер
        if (this.shop.authModule.resendEmailChangeTimer) {
            clearInterval(this.shop.authModule.resendEmailChangeTimer);
            this.shop.authModule.resendEmailChangeTimer = null;
        }
        
        // Очищаем все данные смены email
        this.shop.authModule.pendingEmailChange = null;
        
        // Сбрасываем кнопку
        const resendBtn = document.getElementById('resend-email-change-btn');
        if (resendBtn) {
            resendBtn.textContent = 'Отправить код заново';
            resendBtn.disabled = false;
        }
        
        // Очищаем отображение email
        const emailDisplay = document.getElementById('new-email-display');
        if (emailDisplay) {
            emailDisplay.textContent = '';
        }
    }

    async deleteAccount() {
        // Первое подтверждение
        const firstConfirm = await this.shop.authModule.showConfirmDialog(
            'Удалить аккаунт?',
            'Вы уверены? Это действие нельзя отменить. Все ваши данные будут удалены.'
        );
        
        if (!firstConfirm) return;
        
        // Второе подтверждение
        const secondConfirm = await this.shop.authModule.showConfirmDialog(
            'Подтвердите удаление',
            'Это последнее предупреждение. Вы действительно хотите удалить аккаунт?'
        );
        
        if (!secondConfirm) return;
        
        // Запрос пароля
        const password = await this.shop.authModule.showInputDialog(
            'Подтвердите паролем',
            'Введите ваш пароль для подтверждения удаления аккаунта:',
            'password'
        );
        
        if (!password) return;
        
        try {
            showLoadingIndicator();
            await safeFetch(`${this.shop.API_BASE_URL}/profile`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.shop.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password })
            });
            
            hideLoadingIndicator();
            showToast('Аккаунт удален', 'success');
            this.shop.logout();
        } catch (error) {
            hideLoadingIndicator();
            showToast(error.message || 'Ошибка удаления аккаунта', 'error');
            console.error('Delete account error:', error);
        }
    }

    async showOrderDetails(order) {
        // Загружаем полную информацию о заказе
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.shop.API_BASE_URL}/orders/${order.id}`, {
                headers: {
                    'Authorization': `Bearer ${this.shop.token}`
                }
            });
            
            const fullOrder = await response.json();
            hideLoadingIndicator();
            
            if (!response.ok) {
                showToast(fullOrder.error || 'Ошибка загрузки заказа', 'error');
                return;
            }
            
            this.renderOrderDetailsModal(fullOrder);
        } catch (error) {
            hideLoadingIndicator();
            showToast(error.message || 'Ошибка загрузки заказа', 'error');
        }
    }

    renderOrderDetailsModal(order) {
        // Создаем модальное окно с деталями заказа
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        modal.id = 'order-details-modal';
        
        const content = document.createElement('div');
        content.className = 'modal-content';
        content.style.maxWidth = '600px';
        content.style.maxHeight = '90vh';
        content.style.overflowY = 'auto';
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'close';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => {
            modal.remove();
        });
        
        const title = document.createElement('h2');
        title.textContent = `Заказ #${order.id.substring(0, 8)}`;
        title.style.marginBottom = '20px';
        title.style.color = 'var(--neon-red)';
        
        // Информация о заказе
        const infoDiv = document.createElement('div');
        infoDiv.style.marginBottom = '20px';
        
        const statusP = document.createElement('p');
        statusP.innerHTML = `<strong>Статус:</strong> <span style="color: #00ff88;">${escapeHtml(order.status)}</span>`;
        statusP.style.marginBottom = '10px';
        
        const dateP = document.createElement('p');
        dateP.innerHTML = `<strong>Дата:</strong> ${escapeHtml(new Date(order.created_at).toLocaleString('ru-RU'))}`;
        dateP.style.marginBottom = '10px';
        
        const amountP = document.createElement('p');
        amountP.innerHTML = `<strong>Сумма:</strong> ${escapeHtml(order.total_amount)} ₽`;
        amountP.style.marginBottom = '10px';
        
        // Адрес доставки (редактируемый)
        const addressDiv = document.createElement('div');
        addressDiv.style.marginBottom = '15px';
        addressDiv.style.padding = '15px';
        addressDiv.style.background = 'rgba(255,255,255,0.05)';
        addressDiv.style.borderRadius = '8px';
        
        const addressLabel = document.createElement('label');
        addressLabel.innerHTML = '<strong>Адрес доставки:</strong>';
        addressLabel.style.display = 'block';
        addressLabel.style.marginBottom = '8px';
        
        const addressInput = document.createElement('input');
        addressInput.type = 'text';
        addressInput.value = order.shipping_address || '';
        addressInput.style.cssText = 'width: 100%; padding: 10px; border-radius: 8px; border: 2px solid var(--border-color); background: var(--card-bg); color: var(--text-primary); margin-bottom: 10px;';
        
        const saveAddressBtn = document.createElement('button');
        saveAddressBtn.textContent = 'Сохранить адрес';
        saveAddressBtn.className = 'auth-btn primary-btn';
        saveAddressBtn.style.cssText = 'width: 100%; padding: 10px;';
        saveAddressBtn.addEventListener('click', async () => {
            await this.updateOrderAddress(order.id, addressInput.value);
        });
        
        addressDiv.appendChild(addressLabel);
        addressDiv.appendChild(addressInput);
        addressDiv.appendChild(saveAddressBtn);
        
        // Время доставки (если есть поле)
        let deliveryTimeDiv = null;
        if (order.delivery_time) {
            deliveryTimeDiv = document.createElement('div');
            deliveryTimeDiv.style.marginBottom = '15px';
            deliveryTimeDiv.style.padding = '15px';
            deliveryTimeDiv.style.background = 'rgba(255,255,255,0.05)';
            deliveryTimeDiv.style.borderRadius = '8px';
            
            const timeLabel = document.createElement('label');
            timeLabel.innerHTML = '<strong>Время доставки:</strong>';
            timeLabel.style.display = 'block';
            timeLabel.style.marginBottom = '8px';
            
            const timeInput = document.createElement('input');
            timeInput.type = 'datetime-local';
            timeInput.value = order.delivery_time ? new Date(order.delivery_time).toISOString().slice(0, 16) : '';
            timeInput.style.cssText = 'width: 100%; padding: 10px; border-radius: 8px; border: 2px solid var(--border-color); background: var(--card-bg); color: var(--text-primary); margin-bottom: 10px;';
            
            const saveTimeBtn = document.createElement('button');
            saveTimeBtn.textContent = 'Сохранить время';
            saveTimeBtn.className = 'auth-btn primary-btn';
            saveTimeBtn.style.cssText = 'width: 100%; padding: 10px;';
            saveTimeBtn.addEventListener('click', async () => {
                await this.updateOrderDeliveryTime(order.id, timeInput.value);
            });
            
            deliveryTimeDiv.appendChild(timeLabel);
            deliveryTimeDiv.appendChild(timeInput);
            deliveryTimeDiv.appendChild(saveTimeBtn);
        }
        
        // Товары в заказе
        const itemsDiv = document.createElement('div');
        itemsDiv.style.marginBottom = '20px';
        
        const itemsTitle = document.createElement('h3');
        itemsTitle.textContent = 'Товары:';
        itemsTitle.style.marginBottom = '15px';
        
        itemsDiv.appendChild(itemsTitle);
        
        if (order.order_items && order.order_items.length > 0) {
            order.order_items.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.style.cssText = 'padding: 12px; margin-bottom: 10px; background: rgba(255,255,255,0.03); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;';
                
                const itemInfo = document.createElement('div');
                const productName = item.products ? item.products.title : (item.productName || `Товар #${item.product_id}`);
                itemInfo.innerHTML = `<strong>${escapeHtml(productName)}</strong><br><span style="color: #888; font-size: 0.9rem;">${item.quantity} × ${item.price_at_time} ₽</span>`;
                
                const itemTotal = document.createElement('div');
                itemTotal.innerHTML = `<strong>${item.quantity * item.price_at_time} ₽</strong>`;
                
                itemDiv.appendChild(itemInfo);
                itemDiv.appendChild(itemTotal);
                itemsDiv.appendChild(itemDiv);
            });
        }
        
        // Кнопки действий
        const actionsDiv = document.createElement('div');
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '10px';
        actionsDiv.style.marginTop = '20px';
        
        // Кнопка отмены заказа (только если статус pending)
        if (order.status === 'pending') {
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Отменить заказ';
            cancelBtn.className = 'auth-btn secondary-btn';
            cancelBtn.style.cssText = 'flex: 1; padding: 12px;';
            cancelBtn.addEventListener('click', async () => {
                const confirmed = await this.shop.authModule.showConfirmDialog(
                    'Отменить заказ?',
                    'Вы уверены, что хотите отменить этот заказ?'
                );
                if (confirmed) {
                    await this.cancelOrder(order.id);
                    modal.remove();
                }
            });
            actionsDiv.appendChild(cancelBtn);
        }
        
        const closeDetailsBtn = document.createElement('button');
        closeDetailsBtn.textContent = 'Закрыть';
        closeDetailsBtn.className = 'auth-btn primary-btn';
        closeDetailsBtn.style.cssText = 'flex: 1; padding: 12px;';
        closeDetailsBtn.addEventListener('click', () => {
            modal.remove();
        });
        actionsDiv.appendChild(closeDetailsBtn);
        
        // Собираем все вместе
        infoDiv.appendChild(statusP);
        infoDiv.appendChild(dateP);
        infoDiv.appendChild(amountP);
        
        content.appendChild(closeBtn);
        content.appendChild(title);
        content.appendChild(infoDiv);
        content.appendChild(addressDiv);
        if (deliveryTimeDiv) {
            content.appendChild(deliveryTimeDiv);
        }
        content.appendChild(itemsDiv);
        content.appendChild(actionsDiv);
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        // Закрытие по клику вне модалки
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    async updateOrderAddress(orderId, newAddress) {
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.shop.API_BASE_URL}/orders/${orderId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.shop.token}`
                },
                body: JSON.stringify({ shipping_address: newAddress })
            });
            
            const data = await response.json();
            hideLoadingIndicator();
            
            if (!response.ok) {
                showToast(data.error || 'Ошибка обновления адреса', 'error');
                return false;
            }
            
            showToast('Адрес успешно обновлён', 'success');
            // Обновляем заказы
            await this.loadOrders();
            return true;
        } catch (error) {
            hideLoadingIndicator();
            showToast(error.message || 'Ошибка обновления адреса', 'error');
            return false;
        }
    }

    async updateOrderDeliveryTime(orderId, newTime) {
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.shop.API_BASE_URL}/orders/${orderId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.shop.token}`
                },
                body: JSON.stringify({ delivery_time: newTime })
            });
            
            const data = await response.json();
            hideLoadingIndicator();
            
            if (!response.ok) {
                showToast(data.error || 'Ошибка обновления времени', 'error');
                return false;
            }
            
            showToast('Время доставки успешно обновлено', 'success');
            // Обновляем заказы
            await this.loadOrders();
            return true;
        } catch (error) {
            hideLoadingIndicator();
            showToast(error.message || 'Ошибка обновления времени', 'error');
            return false;
        }
    }

    async cancelOrder(orderId) {
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.shop.API_BASE_URL}/orders/${orderId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.shop.token}`
                }
            });
            
            const data = await response.json();
            hideLoadingIndicator();
            
            if (!response.ok) {
                showToast(data.error || 'Ошибка отмены заказа', 'error');
                return false;
            }
            
            showToast('Заказ успешно отменён', 'success');
            // Обновляем заказы
            await this.loadOrders();
            return true;
        } catch (error) {
            hideLoadingIndicator();
            showToast(error.message || 'Ошибка отмены заказа', 'error');
            return false;
        }
    }
}

