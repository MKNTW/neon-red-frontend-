// admin.js - Модуль для админ-панели
import { escapeHtml, escapeAttr, safeFetch, showLoadingIndicator, hideLoadingIndicator, showToast } from './utils.js';

export class AdminModule {
    constructor(shop) {
        this.shop = shop;
    }

    async openAdminPanel() {
        if (!this.shop.user || !this.shop.user.isAdmin) {
            showToast('Доступ запрещен', 'error');
            return;
        }

        const modal = document.getElementById('admin-modal');
        if (modal) {
            modal.style.display = 'block';
            document.body.style.overflow = 'hidden';
            await this.loadAdminProducts();
        }
    }

    closeAdminPanel() {
        const modal = document.getElementById('admin-modal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    async loadAdminProducts() {
        try {
            const container = document.getElementById('admin-products-list');
            if (!container) return;
            
            if (container.children.length === 0) {
                container.innerHTML = '<div class="admin-loading">Загрузка товаров...</div>';
            }
            
            const response = await safeFetch(`${this.shop.API_BASE_URL}/admin/products`, {
                headers: { 'Authorization': `Bearer ${this.shop.token}` }
            });
            
            const products = await response.json();
            this.renderAdminProducts(products);
        } catch (error) {
            const container = document.getElementById('admin-products-list');
            if (container) {
                container.innerHTML = '<div class="admin-error">Ошибка загрузки товаров</div>';
            }
            showToast(error.message, 'error');
            console.error('Load admin products error:', error);
        }
    }

    renderAdminProducts(products) {
        const container = document.getElementById('admin-products-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        products.forEach(product => {
            const div = document.createElement('div');
            div.className = 'admin-item';
            
            const imageDisplay = product.image_url 
                ? `<img src="${escapeAttr(product.image_url)}" alt="Product" class="admin-product-image-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`
                : '';
            const imageFallback = `<span class="admin-product-image-text" style="${product.image_url ? 'display: none;' : 'display: flex;'}">${escapeHtml((product.title || '?').charAt(0).toUpperCase())}</span>`;
            
            div.innerHTML = `
                <div class="admin-item-header">
                    <div class="admin-product-info">
                        <div class="admin-product-image">
                            ${imageDisplay}
                            ${imageFallback}
                        </div>
                        <div class="admin-product-details">
                            <strong>${escapeHtml(product.title)}</strong>
                            <span class="admin-item-price">${escapeHtml(product.price)} ₽</span>
                        </div>
                    </div>
                </div>
                <div class="admin-item-details">
                    <span>ID: ${escapeHtml(product.id)}</span>
                    <span>В наличии: ${escapeHtml(product.quantity)} шт.</span>
                </div>
                <div class="admin-item-actions">
                    <button class="admin-btn edit" data-product-id="${escapeAttr(product.id)}">✏️ Редактировать</button>
                    <button class="admin-btn delete" data-product-id="${escapeAttr(product.id)}">🗑️ Удалить</button>
                </div>
            `;
            
            const editBtn = div.querySelector('.edit');
            const deleteBtn = div.querySelector('.delete');
            editBtn.addEventListener('click', () => this.editProduct(product.id));
            deleteBtn.addEventListener('click', () => this.deleteProduct(product.id));
            
            container.appendChild(div);
        });
    }

    async editProduct(id) {
        // Проверяем, есть ли товар в локальном списке
        const products = this.shop.productsModule.products || [];
        const product = products.find(p => p.id === id);
        
        // Если товара нет в локальном списке, загружаем его с сервера
        if (!product) {
            // Продолжаем загрузку с сервера
        }

        const modal = document.getElementById('edit-product-modal');
        if (!modal) {
            showToast('Модальное окно редактирования не найдено', 'error');
            return;
        }
        
        modal.style.display = 'block';
        
        // Загружаем данные товара
        try {
            const response = await safeFetch(`${this.shop.API_BASE_URL}/admin/products/${id}`, {
                headers: { 'Authorization': `Bearer ${this.shop.token}` }
            });
            const product = await response.json();
            
            document.getElementById('edit-product-id').value = product.id;
            document.getElementById('edit-product-title').value = product.title;
            document.getElementById('edit-product-description').value = product.description || '';
            document.getElementById('edit-product-price').value = product.price;
            document.getElementById('edit-product-quantity').value = product.quantity;
            document.getElementById('edit-product-image-url').value = product.image_url || '';
            
            // Показываем превью текущего изображения
            const preview = document.getElementById('edit-product-image-preview');
            preview.innerHTML = '';
            if (product.image_url) {
                const img = document.createElement('img');
                img.src = product.image_url;
                img.alt = 'Текущее изображение';
                img.style.cssText = 'max-width: 200px; max-height: 200px; border-radius: 8px; margin-top: 10px;';
                preview.appendChild(img);
            }
            
            // Обработчик загрузки файла
            const fileInput = document.getElementById('edit-product-image-upload');
            const removeBtn = document.getElementById('edit-remove-image');
            fileInput.value = '';
            
            if (removeBtn) {
                removeBtn.style.display = product.image_url ? 'block' : 'none';
                removeBtn.onclick = () => {
                    document.getElementById('edit-product-image-url').value = '';
                    preview.innerHTML = '';
                    removeBtn.style.display = 'none';
                };
            }
            
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.previewImage(file, preview);
                    if (removeBtn) removeBtn.style.display = 'block';
                }
            };
        } catch (error) {
            showToast(error.message || 'Ошибка загрузки товара', 'error');
            console.error('Edit product error:', error);
        }
    }

    previewImage(file, container) {
        const reader = new FileReader();
        reader.onload = (e) => {
            container.innerHTML = '';
            const img = document.createElement('img');
            img.src = e.target.result;
            img.alt = 'Превью';
            img.style.cssText = 'max-width: 200px; max-height: 200px; border-radius: 8px; margin-top: 10px;';
            container.appendChild(img);
        };
        reader.readAsDataURL(file);
    }

    async saveProduct() {
        const id = document.getElementById('edit-product-id').value;
        const title = document.getElementById('edit-product-title').value;
        const description = document.getElementById('edit-product-description').value;
        const price = parseFloat(document.getElementById('edit-product-price').value);
        const quantity = parseInt(document.getElementById('edit-product-quantity').value);
        const imageUrl = document.getElementById('edit-product-image-url').value.trim();
        const fileInput = document.getElementById('edit-product-image-upload');
        const file = fileInput.files[0];

        try {
            let finalImageUrl = imageUrl || null;
            
            // Если загружен файл, сначала загружаем его на сервер
            if (file) {
                if (!file.type || !file.type.startsWith('image/')) {
                    showToast('Недопустимый тип файла. Разрешены только изображения.', 'error');
                    return;
                }
                
                const maxSize = 10 * 1024 * 1024; // 10MB
                if (file.size > maxSize) {
                    showToast('Файл слишком большой. Максимальный размер: 10MB.', 'error');
                    return;
                }
                
                const formData = new FormData();
                formData.append('image', file);
                
                const uploadResponse = await safeFetch(`${this.shop.API_BASE_URL}/admin/products/${id}/upload`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.shop.token}`
                    },
                    body: formData
                });
                
                const uploadData = await uploadResponse.json();
                
                if (uploadData.image_url) {
                    finalImageUrl = uploadData.image_url;
                } else {
                    throw new Error('Сервер не вернул URL изображения');
                }
            }
            
            // Если URL пустой и файла нет, удаляем изображение через API
            if (!finalImageUrl && !file) {
                try {
                    await safeFetch(`${this.shop.API_BASE_URL}/admin/products/${id}/image`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${this.shop.token}`
                        }
                    });
                } catch (err) {
                    console.error('Error deleting image:', err);
                }
                finalImageUrl = null;
            }

            const response = await safeFetch(`${this.shop.API_BASE_URL}/admin/products/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.shop.token}`
                },
                body: JSON.stringify({
                    title,
                    description,
                    price,
                    quantity,
                    image_url: finalImageUrl
                })
            });

            showToast('Товар обновлен', 'success');
            this.closeEditProductModal();
            await this.loadAdminProducts();
            await this.shop.productsModule.loadProducts();
        } catch (error) {
            console.error('Product save error:', error);
            
            let errorMessage = error.message || 'Ошибка сохранения товара';
            
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

    async deleteProduct(id) {
        const confirmed = await this.shop.authModule.showConfirmDialog('Удалить товар?', 'Вы уверены, что хотите удалить этот товар?');
        if (!confirmed) return;

        try {
            await safeFetch(`${this.shop.API_BASE_URL}/admin/products/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.shop.token}` }
            });

            showToast('Товар удален', 'success');
            await this.loadAdminProducts();
            await this.shop.productsModule.loadProducts();
        } catch (error) {
            showToast(error.message, 'error');
            console.error('Delete product error:', error);
        }
    }

    async addNewProduct() {
        const modal = document.getElementById('add-product-modal');
        if (!modal) {
            showToast('Модальное окно добавления не найдено', 'error');
            return;
        }
        
        modal.style.display = 'block';
        
        // Очищаем форму
        document.getElementById('new-product-title').value = '';
        document.getElementById('new-product-description').value = '';
        document.getElementById('new-product-price').value = '';
        document.getElementById('new-product-quantity').value = '';
        document.getElementById('new-product-image').value = '';
        document.getElementById('new-product-image-upload').value = '';
        document.getElementById('new-product-image-preview').innerHTML = '';
        
        // Обработчик загрузки файла
        const fileInput = document.getElementById('new-product-image-upload');
        const preview = document.getElementById('new-product-image-preview');
        const removeBtn = document.getElementById('new-remove-image');
        const urlInput = document.getElementById('new-product-image');
        
        if (removeBtn) {
            removeBtn.onclick = () => {
                urlInput.value = '';
                preview.innerHTML = '';
                fileInput.value = '';
                removeBtn.style.display = 'none';
            };
        }
        
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                this.previewImage(file, preview);
                if (removeBtn) removeBtn.style.display = 'block';
            }
        };
        
        // Обновление превью при вводе URL
        if (urlInput) {
            urlInput.addEventListener('input', () => {
                if (urlInput.value.trim()) {
                    preview.innerHTML = '';
                    const img = document.createElement('img');
                    img.src = urlInput.value;
                    img.alt = 'Превью';
                    img.style.cssText = 'max-width: 200px; max-height: 200px; border-radius: 8px; margin-top: 10px;';
                    img.onerror = () => {
                        preview.innerHTML = '<p style="color:#ff0033; margin-top:10px;">Неверный URL изображения</p>';
                    };
                    preview.appendChild(img);
                    if (removeBtn) removeBtn.style.display = 'block';
                } else {
                    preview.innerHTML = '';
                    if (removeBtn) removeBtn.style.display = 'none';
                }
            });
        }
    }

    async uploadImage(file) {
        if (!file) {
            throw new Error('Файл не выбран');
        }

        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            throw new Error('Недопустимый тип файла. Разрешены только изображения (JPEG, PNG, GIF, WebP).');
        }

        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            throw new Error('Файл слишком большой. Максимальный размер: 10MB.');
        }

        try {
            const formData = new FormData();
            formData.append('image', file);
            
            const response = await safeFetch(`${this.shop.API_BASE_URL}/upload-image`, {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (!data.url) {
                throw new Error('Сервер не вернул URL изображения');
            }
            
            return data.url;
        } catch (error) {
            console.error('Image upload error:', error);
            throw error;
        }
    }

    async saveNewProduct() {
        const title = document.getElementById('new-product-title').value;
        const description = document.getElementById('new-product-description').value;
        const price = parseFloat(document.getElementById('new-product-price').value);
        const quantity = parseInt(document.getElementById('new-product-quantity').value);
        const imageUrl = document.getElementById('new-product-image').value;
        const fileInput = document.getElementById('new-product-image-upload');
        const file = fileInput.files[0];

        try {
            let finalImageUrl = imageUrl || 'https://via.placeholder.com/300';
            
            // Если загружен файл, используем универсальный роут для загрузки
            if (file) {
                try {
                    finalImageUrl = await this.uploadImage(file);
                } catch (uploadError) {
                    console.error('Upload error:', uploadError);
                    // Продолжаем с placeholder, если загрузка не удалась
                }
            }
            
            // Создаем товар с полученным URL изображения
            const productResponse = await safeFetch(`${this.shop.API_BASE_URL}/admin/products`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.shop.token}`
                },
                body: JSON.stringify({
                    title,
                    description,
                    price,
                    quantity,
                    image_url: finalImageUrl
                })
            });
            
            await productResponse.json();
            showToast('Товар создан', 'success');

            this.closeAddProductModal();
            await this.loadAdminProducts();
            await this.shop.productsModule.loadProducts();
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    closeEditProductModal() {
        const modal = document.getElementById('edit-product-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    closeAddProductModal() {
        const modal = document.getElementById('add-product-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    async loadAdminUsers() {
        try {
            const container = document.getElementById('admin-users-list');
            if (!container) return;
            
            if (container.children.length === 0) {
                container.innerHTML = '<div class="admin-loading">Загрузка пользователей...</div>';
            }
            
            const response = await safeFetch(`${this.shop.API_BASE_URL}/admin/users`, {
                headers: { 'Authorization': `Bearer ${this.shop.token}` }
            });
            
            const users = await response.json();
            this.renderAdminUsers(users);
        } catch (error) {
            const container = document.getElementById('admin-users-list');
            if (container) {
                container.innerHTML = '<div class="admin-error">Ошибка загрузки пользователей</div>';
            }
            showToast(error.message, 'error');
            console.error('Load admin users error:', error);
        }
    }

    renderAdminUsers(users) {
        const container = document.getElementById('admin-users-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        users.forEach(user => {
            const div = document.createElement('div');
            div.className = 'admin-item';
            
            const avatarDisplay = user.avatar_url 
                ? `<img src="${escapeAttr(user.avatar_url)}" alt="Avatar" class="admin-user-avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`
                : '';
            const avatarFallback = `<span class="admin-user-avatar-text" style="${user.avatar_url ? 'display: none;' : 'display: flex;'}">${escapeHtml((user.username || 'U').charAt(0).toUpperCase())}</span>`;
            
            div.innerHTML = `
                <div class="admin-item-header">
                    <div class="admin-user-info">
                        <div class="admin-user-avatar">
                            ${avatarDisplay}
                            ${avatarFallback}
                        </div>
                        <div class="admin-user-details">
                            <strong>${escapeHtml(user.username)}</strong>
                            <span class="admin-user-role">${user.isAdmin ? 'Админ' : 'Пользователь'}</span>
                        </div>
                    </div>
                </div>
                <div class="admin-item-details">
                    <span>Email: ${escapeHtml(user.email)}</span>
                    <span>Зарегистрирован: ${escapeHtml(new Date(user.created_at).toLocaleDateString())}</span>
                </div>
                <div class="admin-item-actions">
                    <button class="admin-btn" data-user-id="${escapeAttr(user.id)}">📋 Заказы</button>
                </div>
            `;
            
            const ordersBtn = div.querySelector('.admin-btn');
            ordersBtn.addEventListener('click', () => this.viewUserOrders(user.id));
            
            container.appendChild(div);
        });
    }

    async loadAdminOrders() {
        try {
            const container = document.getElementById('admin-orders-list');
            if (!container) return;
            
            if (container.children.length === 0) {
                container.innerHTML = '<div class="admin-loading">Загрузка заказов...</div>';
            }
            
            const response = await safeFetch(`${this.shop.API_BASE_URL}/admin/orders`, {
                headers: { 'Authorization': `Bearer ${this.shop.token}` }
            });
            
            const orders = await response.json();
            this.renderAdminOrders(orders);
        } catch (error) {
            const container = document.getElementById('admin-orders-list');
            if (container) {
                container.innerHTML = '<div class="admin-error">Ошибка загрузки заказов</div>';
            }
            showToast(error.message, 'error');
            console.error('Load admin orders error:', error);
        }
    }

    renderAdminOrders(orders) {
        const container = document.getElementById('admin-orders-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        orders.forEach(order => {
            const div = document.createElement('div');
            div.className = 'admin-item';
            const orderId = escapeAttr(order.id);
            const safeStatus = escapeAttr(order.status);
            div.innerHTML = `
                <div class="admin-item-header">
                    <strong>Заказ #${escapeHtml(order.id.substring(0, 8))}</strong>
                    <span class="admin-order-status ${safeStatus}">${escapeHtml(order.status)}</span>
                </div>
                <div class="admin-item-details">
                    <span>Клиент: ${escapeHtml(order.user?.username || 'Неизвестно')}</span>
                    <span>Сумма: ${escapeHtml(order.total_amount)} ₽</span>
                    <span>Дата: ${escapeHtml(new Date(order.created_at).toLocaleString())}</span>
                    <span>Адрес: ${escapeHtml(order.shipping_address)}</span>
                </div>
                <div class="admin-item-actions">
                    <select class="status-select" data-order-id="${orderId}">
                        <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Ожидание</option>
                        <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>В обработке</option>
                        <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>Отправлен</option>
                        <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Доставлен</option>
                        <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Отменен</option>
                    </select>
                    <button class="admin-btn view-details" data-order-id="${orderId}">🔍 Детали</button>
                </div>
            `;
            
            const statusSelect = div.querySelector('.status-select');
            const detailsBtn = div.querySelector('.view-details');
            statusSelect.addEventListener('change', (e) => {
                this.updateOrderStatus(order.id, e.target.value);
            });
            detailsBtn.addEventListener('click', () => {
                this.viewOrderDetails(order.id);
            });
            
            container.appendChild(div);
        });
    }

    async updateOrderStatus(orderId, status) {
        try {
            await safeFetch(`${this.shop.API_BASE_URL}/admin/orders/${orderId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.shop.token}`
                },
                body: JSON.stringify({ status })
            });

            showToast('Статус обновлен', 'success');
            await this.loadAdminOrders();
        } catch (error) {
            showToast(error.message, 'error');
            console.error('Update order status error:', error);
        }
    }

    async viewUserOrders(userId) {
        try {
            const response = await safeFetch(`${this.shop.API_BASE_URL}/admin/users/${userId}/orders`, {
                headers: { 'Authorization': `Bearer ${this.shop.token}` }
            });

            const orders = await response.json();
            this.showUserOrdersModal(orders);
        } catch (error) {
            showToast(error.message, 'error');
            console.error('View user orders error:', error);
        }
    }

    showUserOrdersModal(orders) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-hidden', 'false');
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'close';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => modal.remove());
        
        const content = document.createElement('div');
        content.className = 'modal-content';
        content.style.maxWidth = '600px';
        
        const title = document.createElement('h3');
        title.textContent = 'Заказы пользователя';
        
        const ordersList = document.createElement('div');
        ordersList.style.maxHeight = '400px';
        ordersList.style.overflowY = 'auto';
        ordersList.style.marginTop = '20px';
        
        if (orders.length === 0) {
            ordersList.innerHTML = '<p style="text-align:center; color:#666; padding:20px;">Заказов нет</p>';
        } else {
            orders.forEach(order => {
                const orderDiv = document.createElement('div');
                orderDiv.className = 'order-item';
                orderDiv.style.marginBottom = '15px';
                orderDiv.innerHTML = `
                    <p><strong>Заказ #${escapeHtml(order.id.substring(0, 8))}</strong></p>
                    <p>Сумма: ${escapeHtml(order.total_amount)} ₽</p>
                    <p>Статус: ${escapeHtml(order.status)}</p>
                    <p>Дата: ${escapeHtml(new Date(order.created_at).toLocaleString())}</p>
                `;
                ordersList.appendChild(orderDiv);
            });
        }
        
        content.appendChild(closeBtn);
        content.appendChild(title);
        content.appendChild(ordersList);
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    async viewOrderDetails(orderId) {
        try {
            const response = await safeFetch(`${this.shop.API_BASE_URL}/admin/orders/${orderId}`, {
                headers: { 'Authorization': `Bearer ${this.shop.token}` }
            });

            const order = await response.json();
            this.showOrderDetailsModal(order);
        } catch (error) {
            showToast(error.message, 'error');
            console.error('View order details error:', error);
        }
    }

    showOrderDetailsModal(order) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-hidden', 'false');
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'close';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => modal.remove());
        
        const content = document.createElement('div');
        content.className = 'modal-content';
        content.style.maxWidth = '700px';
        
        const title = document.createElement('h3');
        title.textContent = `Детали заказа #${order.id.substring(0, 8)}`;
        
        const details = document.createElement('div');
        details.style.marginTop = '20px';
        details.innerHTML = `
            <div class="order-item">
                <p><strong>ID заказа:</strong> ${escapeHtml(order.id)}</p>
                <p><strong>Клиент:</strong> ${escapeHtml(order.user?.username || 'Неизвестно')}</p>
                <p><strong>Email:</strong> ${escapeHtml(order.user?.email || 'Не указан')}</p>
                <p><strong>Сумма:</strong> ${escapeHtml(order.total_amount)} ₽</p>
                <p><strong>Статус:</strong> ${escapeHtml(order.status)}</p>
                <p><strong>Адрес доставки:</strong> ${escapeHtml(order.shipping_address)}</p>
                <p><strong>Способ оплаты:</strong> ${escapeHtml(order.payment_method || 'Не указан')}</p>
                <p><strong>Дата создания:</strong> ${escapeHtml(new Date(order.created_at).toLocaleString())}</p>
            </div>
            ${order.order_items && order.order_items.length > 0 ? `
                <h4 style="margin-top:20px; color:var(--neon-red);">Товары:</h4>
                ${order.order_items.map(item => `
                    <div class="order-item" style="margin-top:10px;">
                        <p><strong>${escapeHtml(item.products?.title || item.productName || 'Товар')}</strong></p>
                        <p>Количество: ${escapeHtml(item.quantity)}</p>
                        <p>Цена: ${escapeHtml(item.price_at_time)} ₽</p>
                        <p>Итого: ${escapeHtml(item.quantity * item.price_at_time)} ₽</p>
                    </div>
                `).join('')}
            ` : ''}
        `;
        
        content.appendChild(closeBtn);
        content.appendChild(title);
        content.appendChild(details);
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }
}

