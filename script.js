// script.js — адаптированный для мобильных устройств + Админ-панель

// Функция для экранирования HTML (защита от XSS)
function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Функция для экранирования атрибутов
function escapeAttr(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Универсальная функция для fetch запросов с обработкой ошибок
// Глобальный индикатор загрузки
let loadingIndicator = null;

function showLoadingIndicator() {
    if (loadingIndicator) return;
    
    loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'global-loading';
    loadingIndicator.innerHTML = `
        <div class="loading-spinner">
            <div class="spinner-ring"></div>
            <div class="spinner-ring"></div>
            <div class="spinner-ring"></div>
        </div>
    `;
    document.body.appendChild(loadingIndicator);
}

function hideLoadingIndicator() {
    if (loadingIndicator) {
        loadingIndicator.remove();
        loadingIndicator = null;
    }
}

async function safeFetch(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 секунд таймаут
    
    // Показываем индикатор загрузки только для не-GET запросов или если явно указано
    const showLoading = options.method && options.method !== 'GET' || options.showLoading === true;
    if (showLoading) {
        showLoadingIndicator();
    }
    
    // Логирование для отладки
    if (options.method && options.method !== 'GET') {
        console.log(`[safeFetch] ${options.method} ${url}`);
    }
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            credentials: 'include'
        });
        
        clearTimeout(timeoutId);
        
        // Если ответ не OK, пытаемся получить сообщение об ошибке
        if (!response.ok) {
            let errorMessage = `Ошибка ${response.status}`;
            let errorData = null;
            try {
                errorData = await response.json();
                errorMessage = errorData.error || errorData.message || errorMessage;
            } catch (e) {
                // Если не удалось распарсить JSON, используем статус
                if (response.status === 401) errorMessage = 'Требуется авторизация';
                else if (response.status === 403) errorMessage = 'Доступ запрещен';
                else if (response.status === 404) errorMessage = `Ресурс не найден: ${url}`;
                else if (response.status === 400) errorMessage = 'Неверный запрос';
                else if (response.status === 409) errorMessage = 'Конфликт данных';
                else if (response.status === 429) errorMessage = 'Слишком много запросов';
                else if (response.status === 500) errorMessage = 'Ошибка сервера';
            }
            
            // Сохраняем данные ошибки для дальнейшей обработки
            const error = new Error(errorMessage);
            error.status = response.status;
            error.data = errorData;
            error.url = url;
            
            console.error(`[safeFetch] Error ${response.status} for ${url}:`, errorMessage);
            throw error;
        }
        
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Превышено время ожидания запроса');
        }
        if (error instanceof TypeError && error.message.includes('fetch')) {
            console.error(`[safeFetch] Network error for ${url}:`, error);
            throw new Error('Ошибка сети. Проверьте подключение к интернету');
        }
        throw error;
    } finally {
        if (showLoading) {
            hideLoadingIndicator();
        }
    }
}

class NeonShop {
    constructor() {
        this.cart = JSON.parse(localStorage.getItem('cart')) || [];
        this.products = [];
        this.user = JSON.parse(localStorage.getItem('user')) || null;
        this.token = localStorage.getItem('token') || null;
        // Категории больше не используются
        this.productsEventDelegate = false; // Флаг для делегирования событий
        this.pendingVerificationEmail = null; // Email для подтверждения
        this.resendCodeTimer = null; // Таймер для повторной отправки
        this.pendingEmailChange = null; // Новый email для смены
        this.resendEmailChangeTimer = null; // Таймер для повторной отправки кода смены email
        this.pendingRegistrationToken = null; // Токен после подтверждения email
        this.pendingRegistrationUser = null; // Данные пользователя после подтверждения email
        this.isConfirmingCode = false; // Флаг для предотвращения повторных запросов подтверждения кода
        this.pendingResetEmail = null; // Email для восстановления пароля
        this.pendingResetUserId = null; // ID пользователя для восстановления пароля
        this.resendResetTimer = null; // Таймер для повторной отправки кода восстановления

        // Автоматическое определение URL для API
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            this.API_BASE_URL = 'http://localhost:3001/api';
        } else if (window.location.hostname === 'shop.mkntw.xyz' || window.location.hostname.includes('mkntw.xyz')) {
            // Для продакшена используем apiforshop.mkntw.xyz
            this.API_BASE_URL = 'https://apiforshop.mkntw.xyz/api';
        } else {
            // Fallback на apiforshop.mkntw.xyz
            this.API_BASE_URL = 'https://apiforshop.mkntw.xyz/api';
        }
        
        console.log('API Base URL:', this.API_BASE_URL);

        this.isMobile = this.checkIsMobile();
        this.init();
    }

    checkIsMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               window.innerWidth <= 768;
    }

    async init() {
        // Проверка возраста
        this.setupAgeVerification();
        
        // Оптимизация: обновляем UI синхронно, асинхронные операции выполняем параллельно
        this.updateCartInfo();
        this.updateAuthUI();
        this.setupEventListeners();
        
        // Параллельная загрузка данных
        const promises = [this.loadProducts()];
        if (this.token) {
            promises.push(this.validateToken());
        }
        await Promise.all(promises);
        
        // Обновляем UI после загрузки
        this.updateAuthUI();

        // Предотвращение масштабирования при двойном тапе
        this.preventDoubleTapZoom();

        // Инициализация свайпов для мобильных
        if (this.isMobile) {
            this.setupSwipeGestures();
        }
    }

    // === АДМИНСКИЙ ИНТЕРФЕЙС ===
    async openAdminPanel() {
        if (!this.user || !this.user.isAdmin) {
            this.showToast('Доступ запрещен', 'error');
            return;
        }

        const modal = document.getElementById('admin-modal');
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        
        // Загружаем только товары при открытии (остальное загрузится при переключении вкладок)
        await this.loadAdminProducts();
    }

    closeAdminPanel() {
        const modal = document.getElementById('admin-modal');
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }

    async loadAdminProducts() {
        try {
            const container = document.getElementById('admin-products-list');
            if (!container) return;
            
            // Показываем индикатор загрузки только если список пуст
            if (container.children.length === 0) {
                container.innerHTML = '<div class="admin-loading">Загрузка товаров...</div>';
            }
            
            const response = await safeFetch(`${this.API_BASE_URL}/admin/products`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            const products = await response.json();
            this.renderAdminProducts(products);
        } catch (error) {
            const container = document.getElementById('admin-products-list');
            if (container) {
                container.innerHTML = '<div class="admin-error">Ошибка загрузки товаров</div>';
            }
            this.showToast(error.message, 'error');
            console.error('Load admin products error:', error);
        }
    }

    renderAdminProducts(products) {
        const container = document.getElementById('admin-products-list');
        container.innerHTML = '';
        
        products.forEach(product => {
            const div = document.createElement('div');
            div.className = 'admin-item';
            
            // Определяем, показывать ли изображение или первую букву названия (как в ЛК)
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
            
            // Добавляем обработчики событий
            const editBtn = div.querySelector('.edit');
            const deleteBtn = div.querySelector('.delete');
            editBtn.addEventListener('click', () => this.editProduct(product.id));
            deleteBtn.addEventListener('click', () => this.deleteProduct(product.id));
            
            container.appendChild(div);
        });
    }



    async loadAdminUsers() {
        try {
            const container = document.getElementById('admin-users-list');
            if (!container) return;
            
            // Показываем индикатор загрузки только если список пуст
            if (container.children.length === 0) {
                container.innerHTML = '<div class="admin-loading">Загрузка пользователей...</div>';
            }
            
            const response = await safeFetch(`${this.API_BASE_URL}/admin/users`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            const users = await response.json();
            this.renderAdminUsers(users);
        } catch (error) {
            const container = document.getElementById('admin-users-list');
            if (container) {
                container.innerHTML = '<div class="admin-error">Ошибка загрузки пользователей</div>';
            }
            this.showToast(error.message, 'error');
            console.error('Load admin users error:', error);
        }
    }

    renderAdminUsers(users) {
        const container = document.getElementById('admin-users-list');
        container.innerHTML = '';
        
        users.forEach(user => {
            const div = document.createElement('div');
            div.className = 'admin-item';
            
            // Определяем, показывать ли аватар или первую букву имени
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
            
            // Добавляем обработчик событий
            const ordersBtn = div.querySelector('.admin-btn');
            ordersBtn.addEventListener('click', () => this.viewUserOrders(user.id));
            
            container.appendChild(div);
        });
    }

    async loadAdminOrders() {
        try {
            const container = document.getElementById('admin-orders-list');
            if (!container) return;
            
            // Показываем индикатор загрузки только если список пуст
            if (container.children.length === 0) {
                container.innerHTML = '<div class="admin-loading">Загрузка заказов...</div>';
            }
            
            const response = await safeFetch(`${this.API_BASE_URL}/admin/orders`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            const orders = await response.json();
            this.renderAdminOrders(orders);
        } catch (error) {
            const container = document.getElementById('admin-orders-list');
            if (container) {
                container.innerHTML = '<div class="admin-error">Ошибка загрузки заказов</div>';
            }
            this.showToast(error.message, 'error');
            console.error('Load admin orders error:', error);
        }
    }

    renderAdminOrders(orders) {
        const container = document.getElementById('admin-orders-list');
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
            
            // Добавляем обработчики событий
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

    async editProduct(id) {
        const product = this.products.find(p => p.id === id);
        if (!product) return;

        const modal = document.getElementById('edit-product-modal');
        modal.style.display = 'block';
        
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
        fileInput.value = ''; // Сбрасываем предыдущий выбор
        
        // Показываем кнопку удаления если есть изображение
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
            
            // Если загружен файл, сначала загружаем его на сервер (как в аватаре)
            if (file) {
                // Проверка типа файла
                if (!file.type || !file.type.startsWith('image/')) {
                    this.showToast('Недопустимый тип файла. Разрешены только изображения.', 'error');
                    return;
                }
                
                // Проверка размера файла (макс 10MB для товара)
                const maxSize = 10 * 1024 * 1024; // 10MB
                if (file.size > maxSize) {
                    this.showToast('Файл слишком большой. Максимальный размер: 10MB.', 'error');
                    return;
                }
                
                const formData = new FormData();
                formData.append('image', file);
                
                const uploadResponse = await safeFetch(`${this.API_BASE_URL}/admin/products/${id}/upload`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`
                        // НЕ добавляем Content-Type - браузер установит его автоматически для FormData
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
                    await safeFetch(`${this.API_BASE_URL}/admin/products/${id}/image`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${this.token}`
                        }
                    });
                } catch (err) {
                    console.error('Error deleting image:', err);
                }
                finalImageUrl = null;
            }

            const response = await safeFetch(`${this.API_BASE_URL}/admin/products/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    title,
                    description,
                    price,
                    quantity,
                    image_url: finalImageUrl
                })
            });

            this.showToast('Товар обновлен', 'success');
            this.closeEditProductModal();
            await this.loadAdminProducts();
            await this.loadProducts();
        } catch (error) {
            console.error('Product save error:', error);
            
            let errorMessage = error.message || 'Ошибка сохранения товара';
            
            // Более понятные сообщения об ошибках (как в аватаре)
            if (errorMessage.includes('404') || errorMessage.includes('не найден')) {
                errorMessage = 'Сервер не отвечает. Проверьте, что API сервер запущен на ' + this.API_BASE_URL;
            } else if (errorMessage.includes('401') || errorMessage.includes('авторизация')) {
                errorMessage = 'Требуется авторизация. Пожалуйста, войдите снова.';
            } else if (errorMessage.includes('сети') || errorMessage.includes('fetch')) {
                errorMessage = 'Ошибка сети. Проверьте подключение к интернету.';
            }
            
            this.showToast(errorMessage, 'error');
        }
    }

    async deleteProduct(id) {
        const confirmed = await this.showConfirmDialog('Удалить товар?', 'Вы уверены, что хотите удалить этот товар?');
        if (!confirmed) return;

        try {
            await safeFetch(`${this.API_BASE_URL}/admin/products/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            this.showToast('Товар удален', 'success');
            await this.loadAdminProducts();
            await this.loadProducts();
        } catch (error) {
            this.showToast(error.message, 'error');
            console.error('Delete product error:', error);
        }
    }

    async addNewProduct() {
        const modal = document.getElementById('add-product-modal');
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

    // === ЗАГРУЗКА ИЗОБРАЖЕНИЙ ЧЕРЕЗ УНИВЕРСАЛЬНЫЙ РОУТ ===
    // Пример использования нового роута /api/upload-image:
    // 
    // const formData = new FormData();
    // formData.append('image', fileInput.files[0]);
    // 
    // const res = await fetch('https://apiforshop.mkntw.xyz/api/upload-image', {
    //     method: 'POST',
    //     body: formData
    // });
    // 
    // const data = await res.json();
    // console.log(data.url); // URL загруженного изображения

    async uploadImage(file) {
        if (!file) {
            throw new Error('Файл не выбран');
        }

        // Проверка типа файла на клиенте
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            throw new Error('Недопустимый тип файла. Разрешены только изображения (JPEG, PNG, GIF, WebP).');
        }

        // Проверка размера файла (макс 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            throw new Error('Файл слишком большой. Максимальный размер: 10MB.');
        }

        try {
            const formData = new FormData();
            formData.append('image', file);
            
            console.log('Uploading image:', file.name, file.type, file.size);
            
            // НЕ устанавливаем Content-Type - браузер установит его автоматически с boundary
            const response = await safeFetch(`${this.API_BASE_URL}/upload-image`, {
                method: 'POST',
                body: formData
                // НЕ добавляем headers - браузер установит Content-Type автоматически для FormData
            });
            
            const data = await response.json();
            
            if (!data.url) {
                throw new Error('Сервер не вернул URL изображения');
            }
            
            console.log('Image uploaded successfully:', data.url);
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
            
            // Если загружен файл, используем новый универсальный роут для загрузки
            if (file) {
                try {
                    finalImageUrl = await this.uploadImage(file);
                } catch (uploadError) {
                    console.error('Upload error:', uploadError);
                    // Продолжаем с placeholder, если загрузка не удалась
                }
            }
            
            // Создаем товар с полученным URL изображения
            const productResponse = await safeFetch(`${this.API_BASE_URL}/admin/products`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
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
            this.showToast('Товар создан', 'success');

            this.closeAddProductModal();
            await this.loadAdminProducts();
            await this.loadProducts();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    }


    

    async updateOrderStatus(orderId, status) {
        try {
            await safeFetch(`${this.API_BASE_URL}/admin/orders/${orderId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ status })
            });

            this.showToast('Статус обновлен', 'success');
            await this.loadAdminOrders();
        } catch (error) {
            this.showToast(error.message, 'error');
            console.error('Update order status error:', error);
        }
    }

    async viewUserOrders(userId) {
        try {
            const response = await safeFetch(`${this.API_BASE_URL}/admin/users/${userId}/orders`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const orders = await response.json();
            this.showUserOrdersModal(orders);
        } catch (error) {
            this.showToast(error.message, 'error');
            console.error('View user orders error:', error);
        }
    }

    async viewOrderDetails(orderId) {
        try {
            const response = await safeFetch(`${this.API_BASE_URL}/admin/orders/${orderId}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const order = await response.json();
            this.showOrderDetailsModal(order);
        } catch (error) {
            this.showToast(error.message, 'error');
            console.error('View order details error:', error);
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
        
        // Закрытие по клику вне модалки
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
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
                        <p><strong>${escapeHtml(item.products?.title || 'Товар')}</strong></p>
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
        
        // Закрытие по клику вне модалки
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    closeEditProductModal() {
        document.getElementById('edit-product-modal').style.display = 'none';
    }

    closeAddProductModal() {
        document.getElementById('add-product-modal').style.display = 'none';
    }


    // === ЖЕСТЫ ДЛЯ МОБИЛЬНЫХ ===
    setupSwipeGestures() {
        let touchStartX = 0;
        let touchStartY = 0;

        document.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        document.addEventListener('touchend', (e) => {
            if (!touchStartX || !touchStartY) return;

            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;

            const diffX = touchStartX - touchEndX;
            const diffY = touchStartY - touchEndY;

            // Горизонтальный свайп (только если вертикальное движение минимально)
            if (Math.abs(diffX) > 50 && Math.abs(diffY) < 30) {
                // Свайп влево для закрытия модальных окон
                if (diffX > 0) {
                    this.closeAllModals();
                }
            }

            touchStartX = 0;
            touchStartY = 0;
        }, { passive: true });
    }

    preventDoubleTapZoom() {
        let lastTouchEnd = 0;

        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, { passive: false });
    }

    // === АДАПТИВНЫЕ УВЕДОМЛЕНИЯ ===
    showToast(message, type = 'success', duration = 3000) {
        const container = document.getElementById('toast-container');
        const toastId = `toast-${Date.now()}`;

        const toast = document.createElement('div');
        toast.id = toastId;
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');

        const icon = document.createElement('div');
        icon.className = 'toast-icon';
        icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : 'i';
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'toast-message';
        messageDiv.textContent = message;
        
        const progress = document.createElement('div');
        progress.className = 'toast-progress';
        progress.style.animationDuration = `${duration}ms`;
        
        toast.appendChild(icon);
        toast.appendChild(messageDiv);
        toast.appendChild(progress);

        container.appendChild(toast);

        // Для мобильных устройств используем requestAnimationFrame
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.classList.add('show');
            });
        });

        const timer = setTimeout(() => {
            this.removeToast(toastId);
        }, duration);

        // Закрытие по тапу на мобильных
        toast.addEventListener('click', () => {
            clearTimeout(timer);
            this.removeToast(toastId);
        });

        // Вибрация на мобильных при ошибке
        if (type === 'error' && 'vibrate' in navigator) {
            navigator.vibrate(100);
        }
    }

    // === АДАПТИВНЫЕ МОДАЛЬНЫЕ ОКНА ===
    openAuthModal() {
        const modal = document.getElementById('auth-modal');
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';

        // Автофокус на первом поле
        setTimeout(() => {
            const input = document.getElementById('login-username') || 
                         document.getElementById('register-username');
            if (input) input.focus();
        }, 300);
    }

    closeAuthModal() {
        const modal = document.getElementById('auth-modal');
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }

    closeProfileModal() {
        const modal = document.getElementById('profile-modal');
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }

    openProfileModal() {
        if (!this.user) return;

        const modal = document.getElementById('profile-modal');
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';

        // Обновляем заголовок профиля
        const usernameHeader = document.getElementById('profile-username-header');
        const emailHeader = document.getElementById('profile-email-header');
        const avatarText = document.getElementById('profile-avatar-text');
        const avatarImg = document.getElementById('profile-avatar-img');
        const adminBadge = document.getElementById('profile-isadmin-badge');
        
        if (usernameHeader) usernameHeader.textContent = this.user.username;
        if (emailHeader) emailHeader.textContent = this.user.email;
        
        // Обновляем аватар
        if (this.user.avatar_url) {
            if (avatarImg) {
                avatarImg.src = this.user.avatar_url;
                avatarImg.style.display = 'block';
            }
            if (avatarText) avatarText.style.display = 'none';
        } else {
            if (avatarImg) avatarImg.style.display = 'none';
            if (avatarText) {
                avatarText.textContent = (this.user.username || 'U').charAt(0).toUpperCase();
                avatarText.style.display = 'flex';
            }
        }
        
        if (adminBadge) adminBadge.style.display = this.user.isAdmin ? 'flex' : 'none';

        // Обновляем детали профиля
        const username = document.getElementById('profile-username');
        const email = document.getElementById('profile-email');
        const fullname = document.getElementById('profile-fullname');
        
        if (username) username.textContent = this.user.username;
        if (email) email.textContent = this.user.email;
        if (fullname) fullname.textContent = this.user.fullName || 'Не указано';

        this.loadUserOrders();
        this.setupProfileEditListeners();
    }
    
    setupProfileEditListeners() {
        // Обработчики для кнопок редактирования
        document.querySelectorAll('.profile-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const field = e.currentTarget.dataset.field;
                this.showEditForm(field);
            });
        });
        
        // Обработчик загрузки аватара
        const avatarUpload = document.getElementById('profile-avatar-upload');
        if (avatarUpload) {
            avatarUpload.addEventListener('change', (e) => {
                this.handleAvatarUpload(e.target.files[0]);
            });
        }
    }
    
    showEditForm(field) {
        // Скрываем все формы редактирования
        document.querySelectorAll('.profile-edit-form').forEach(form => {
            form.style.display = 'none';
        });
        
        // Показываем нужную форму
        const form = document.getElementById(`edit-${field}-form`);
        if (form) {
            form.style.display = 'flex';
            const input = form.querySelector('input');
            if (input) {
                input.focus();
                if (field === 'username') input.value = this.user.username || '';
                else if (field === 'email') input.value = this.user.email || '';
                else if (field === 'fullname') input.value = this.user.fullName || '';
            }
        }
    }
    
    async handleAvatarUpload(file) {
        if (!file) return;
        
        // Проверка типа файла
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            this.showToast('Недопустимый тип файла. Разрешены только изображения.', 'error');
            return;
        }
        
        // Проверка размера файла (макс 5MB для аватара)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            this.showToast('Файл слишком большой. Максимальный размер: 5MB.', 'error');
            return;
        }
        
        try {
            const formData = new FormData();
            formData.append('avatar', file);
            
            const avatarUrl = `${this.API_BASE_URL}/profile/avatar`;
            console.log('Uploading avatar to:', avatarUrl);
            console.log('API Base URL:', this.API_BASE_URL);
            console.log('Token exists:', !!this.token);
            
            const response = await safeFetch(avatarUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                    // НЕ добавляем Content-Type - браузер установит его автоматически для FormData
                },
                body: formData
            });
            
            const data = await response.json();
            console.log('Avatar upload response:', data);
            
            if (data.avatar_url) {
                this.user.avatar_url = data.avatar_url;
                localStorage.setItem('user', JSON.stringify(this.user));
                
                const avatarImg = document.getElementById('profile-avatar-img');
                const avatarText = document.getElementById('profile-avatar-text');
                
                if (avatarImg) {
                    avatarImg.src = data.avatar_url;
                    avatarImg.style.display = 'block';
                }
                if (avatarText) avatarText.style.display = 'none';
                
                this.showToast('Фото профиля обновлено', 'success');
            } else {
                throw new Error('Сервер не вернул URL аватара');
            }
        } catch (error) {
            console.error('Avatar upload error:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                API_BASE_URL: this.API_BASE_URL
            });
            
            let errorMessage = error.message || 'Ошибка загрузки фото';
            
            // Более понятные сообщения об ошибках
            if (errorMessage.includes('404') || errorMessage.includes('не найден')) {
                errorMessage = 'Сервер не отвечает. Проверьте, что API сервер запущен на ' + this.API_BASE_URL;
            } else if (errorMessage.includes('401') || errorMessage.includes('авторизация')) {
                errorMessage = 'Требуется авторизация. Пожалуйста, войдите снова.';
            } else if (errorMessage.includes('сети') || errorMessage.includes('fetch')) {
                errorMessage = 'Ошибка сети. Проверьте подключение к интернету.';
            }
            
            this.showToast(errorMessage, 'error');
        }
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
            const currentValue = this.user[field === 'fullname' ? 'fullName' : field];
            if (value === currentValue || (value === '' && field === 'fullname' && !currentValue)) {
                this.showToast('Значение не изменилось', 'info');
                return;
            }
            
            const requestBody = { [serverField]: value };
            
            const response = await safeFetch(`${this.API_BASE_URL}/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(requestBody)
            });
            
            const data = await response.json();
            
            if (data.user) {
                this.user = data.user;
                localStorage.setItem('user', JSON.stringify(this.user));
                this.updateAuthUI();
                this.openProfileModal(); // Перезагружаем профиль
                this.showToast('Профиль обновлен', 'success');
            }
        } catch (error) {
            this.showToast(error.message || 'Ошибка обновления профиля', 'error');
            console.error('Update profile error:', error);
        }
    }
    
    async changeEmail() {
        const emailInput = document.getElementById('edit-email-input');
        const emailForm = document.getElementById('edit-email-form');
        const codeForm = document.getElementById('edit-email-code-form');
        const emailError = document.getElementById('email-code-error');
        
        if (!emailInput) {
            this.showToast('Ошибка: поле ввода email не найдено', 'error');
            return false;
        }
        
        const newEmail = emailInput.value.trim();
        
        // Валидация email
        if (!newEmail) {
            this.showToast('Введите новый email', 'error');
            return false;
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail)) {
            this.showToast('Неверный формат email', 'error');
            return false;
        }
        
        // Проверяем, не совпадает ли с текущим email
        if (this.user && this.user.email && newEmail.toLowerCase() === this.user.email.toLowerCase()) {
            this.showToast('Это ваш текущий email', 'info');
            return false;
        }
        
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.API_BASE_URL}/profile/change-email`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ email: newEmail })
            });
            
            const data = await response.json();
            hideLoadingIndicator();
            
            // Проверяем статус ответа
            if (!response.ok) {
                const errorMsg = data?.error || data?.message || 'Ошибка отправки кода';
                this.showToast(errorMsg, 'error');
                return false;
            }
            
            if (data.success) {
                // Сохраняем новый email для подтверждения
                this.pendingEmailChange = newEmail.toLowerCase();
                
                // Скрываем форму ввода email, показываем форму ввода кода
                if (emailForm) emailForm.style.display = 'none';
                if (codeForm) {
                    codeForm.style.display = 'block';
                    // Устанавливаем email в поле отображения
                    const emailDisplay = document.getElementById('new-email-display');
                    if (emailDisplay) {
                        emailDisplay.textContent = newEmail;
                    }
                    // Очищаем поле кода
                    const codeInput = document.getElementById('edit-email-code-input');
                    if (codeInput) {
                        codeInput.value = '';
                    }
                }
                
                // Запускаем таймер для повторной отправки
                this.startResendEmailChangeTimer();
                
                this.showToast('Код подтверждения отправлен на новый email', 'success');
                return true;
            } else {
                const errorMsg = data.error || data.message || 'Ошибка отправки кода';
                this.showToast(errorMsg, 'error');
                return false;
            }
        } catch (error) {
            hideLoadingIndicator();
            
            // Улучшенная обработка ошибок
            let errorMessage = error.message || 'Ошибка отправки кода';
            
            // Если ошибка сети
            if (errorMessage.includes('Network') || errorMessage.includes('fetch') || errorMessage.includes('сети')) {
                errorMessage = 'Ошибка сети. Проверьте подключение и попробуйте снова';
            }
            
            // Если ошибка от сервера, используем данные из error.data
            if (error.data) {
                errorMessage = error.data.error || error.data.message || errorMessage;
            }
            
            this.showToast(errorMessage, 'error');
            return false;
        }
    }
    
    async confirmEmailChange() {
        const codeInput = document.getElementById('edit-email-code-input');
        const codeError = document.getElementById('email-code-error');
        const emailForm = document.getElementById('edit-email-form');
        const codeForm = document.getElementById('edit-email-code-form');
        
        if (!codeInput) {
            this.showToast('Ошибка: поле ввода кода не найдено', 'error');
            return false;
        }
        
        if (!this.pendingEmailChange) {
            this.showToast('Ошибка: email не найден. Начните смену email заново', 'error');
            // Возвращаемся к форме ввода email
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
            this.showToast('Введите 6-значный код', 'error');
            return false;
        }
        
        if (codeError) {
            codeError.textContent = '';
            codeError.style.display = 'none';
        }
        
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.API_BASE_URL}/profile/confirm-email-change`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    email: this.pendingEmailChange,
                    code: code
                })
            });
            
            const data = await response.json();
            hideLoadingIndicator();
            
            // Проверяем статус ответа
            if (!response.ok) {
                const errorMsg = data?.error || data?.message || 'Ошибка подтверждения';
                this.showToast(errorMsg, 'error');
                if (codeError) {
                    codeError.textContent = errorMsg;
                    codeError.style.display = 'block';
                }
                return false;
            }
            
            if (data.success && data.user) {
                // Обновляем данные пользователя
                this.user = data.user;
                localStorage.setItem('user', JSON.stringify(this.user));
                this.updateAuthUI();
                
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
                if (this.resendEmailChangeTimer) {
                    clearInterval(this.resendEmailChangeTimer);
                    this.resendEmailChangeTimer = null;
                }
                
                // Очищаем pendingEmailChange
                this.pendingEmailChange = null;
                
                this.showToast('Email успешно изменён!', 'success');
                return true;
            } else {
                const errorMsg = data.error || data.message || 'Ошибка подтверждения';
                this.showToast(errorMsg, 'error');
                if (codeError) {
                    codeError.textContent = errorMsg;
                    codeError.style.display = 'block';
                }
                return false;
            }
        } catch (error) {
            hideLoadingIndicator();
            
            // Улучшенная обработка ошибок
            let errorMessage = error.message || 'Ошибка подтверждения';
            
            // Если ошибка сети
            if (errorMessage.includes('Network') || errorMessage.includes('fetch') || errorMessage.includes('сети')) {
                errorMessage = 'Ошибка сети. Проверьте подключение и попробуйте снова';
            }
            
            // Если ошибка от сервера, используем данные из error.data
            if (error.data) {
                errorMessage = error.data.error || error.data.message || errorMessage;
            }
            
            this.showToast(errorMessage, 'error');
            if (codeError) {
                codeError.textContent = errorMessage;
                codeError.style.display = 'block';
            }
            return false;
        }
    }
    
    async resendEmailChangeCode() {
        if (!this.pendingEmailChange) {
            this.showToast('Ошибка: email не найден. Начните смену email заново', 'error');
            return false;
        }
        
        const resendBtn = document.getElementById('resend-email-change-btn');
        if (resendBtn && resendBtn.disabled) {
            return false;
        }
        
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.API_BASE_URL}/profile/change-email`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ email: this.pendingEmailChange })
            });
            
            const data = await response.json();
            hideLoadingIndicator();
            
            // Проверяем статус ответа
            if (!response.ok) {
                const errorMsg = data?.error || data?.message || 'Ошибка отправки кода';
                this.showToast(errorMsg, 'error');
                return false;
            }
            
            if (data.success) {
                this.showToast('Новый код отправлен на email', 'success');
                this.startResendEmailChangeTimer();
                return true;
            } else {
                const errorMsg = data.error || data.message || 'Ошибка отправки кода';
                this.showToast(errorMsg, 'error');
                return false;
            }
        } catch (error) {
            hideLoadingIndicator();
            
            // Улучшенная обработка ошибок
            let errorMessage = error.message || 'Ошибка отправки кода';
            
            // Если ошибка сети
            if (errorMessage.includes('Network') || errorMessage.includes('fetch') || errorMessage.includes('сети')) {
                errorMessage = 'Ошибка сети. Проверьте подключение и попробуйте снова';
            }
            
            // Если ошибка от сервера, используем данные из error.data
            if (error.data) {
                errorMessage = error.data.error || error.data.message || errorMessage;
            }
            
            this.showToast(errorMessage, 'error');
            return false;
        }
    }
    
    startResendEmailChangeTimer() {
        const resendBtn = document.getElementById('resend-email-change-btn');
        if (!resendBtn) return;
        
        let timer = 60;
        resendBtn.disabled = true;
        resendBtn.textContent = `Отправить код заново (${timer})`;
        
        if (this.resendEmailChangeTimer) {
            clearInterval(this.resendEmailChangeTimer);
        }
        
        this.resendEmailChangeTimer = setInterval(() => {
            timer--;
            resendBtn.textContent = `Отправить код заново (${timer})`;
            
            if (timer <= 0) {
                clearInterval(this.resendEmailChangeTimer);
                this.resendEmailChangeTimer = null;
                resendBtn.textContent = 'Отправить код заново';
                resendBtn.disabled = false;
            }
        }, 1000);
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
        if (this.resendEmailChangeTimer) {
            clearInterval(this.resendEmailChangeTimer);
            this.resendEmailChangeTimer = null;
        }
        
        // Очищаем pendingEmailChange
        this.pendingEmailChange = null;
        
        // Сбрасываем кнопку
        const resendBtn = document.getElementById('resend-email-change-btn');
        if (resendBtn) {
            resendBtn.textContent = 'Отправить код заново';
            resendBtn.disabled = false;
        }
    }
    
    // === ВОССТАНОВЛЕНИЕ ПАРОЛЯ ===
    showForgotPassword() {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('forgot-password-form').style.display = 'block';
        document.getElementById('select-account-form').style.display = 'none';
        document.getElementById('reset-password-form').style.display = 'none';
        document.getElementById('auth-title').textContent = 'Восстановление пароля';
        document.getElementById('auth-subtitle').textContent = 'Введите email для восстановления';
        
        // Очищаем поля
        const emailInput = document.getElementById('forgot-email');
        if (emailInput) emailInput.value = '';
        const errorEl = document.getElementById('forgot-email-error');
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
        }
    }
    
    async sendPasswordResetCode() {
        const emailInput = document.getElementById('forgot-email');
        const errorEl = document.getElementById('forgot-email-error');
        
        if (!emailInput) {
            this.showToast('Ошибка: поле ввода email не найдено', 'error');
            return false;
        }
        
        const email = emailInput.value.trim();
        
        // Валидация email
        if (!email) {
            if (errorEl) {
                errorEl.textContent = 'Введите email';
                errorEl.style.display = 'block';
            }
            this.showToast('Введите email', 'error');
            return false;
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            if (errorEl) {
                errorEl.textContent = 'Неверный формат email';
                errorEl.style.display = 'block';
            }
            this.showToast('Неверный формат email', 'error');
            return false;
        }
        
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
        }
        
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.API_BASE_URL}/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.toLowerCase() })
            });
            
            const data = await response.json();
            hideLoadingIndicator();
            
            if (!response.ok) {
                const errorMsg = data?.error || data?.message || 'Ошибка отправки кода';
                this.showToast(errorMsg, 'error');
                if (errorEl) {
                    errorEl.textContent = errorMsg;
                    errorEl.style.display = 'block';
                }
                return false;
            }
            
            // Если найдено несколько аккаунтов
            if (data.accounts && data.accounts.length > 1) {
                this.pendingResetEmail = email.toLowerCase();
                this.showAccountSelection(data.accounts);
                return true;
            }
            
            // Если один аккаунт или список не передан
            if (data.success || data.accounts?.length === 1) {
                this.pendingResetEmail = email.toLowerCase();
                this.pendingResetUserId = data.accounts?.[0]?.id || data.userId;
                this.showResetPasswordForm();
                return true;
            }
            
            this.showToast('Ошибка: неожиданный ответ сервера', 'error');
            return false;
        } catch (error) {
            hideLoadingIndicator();
            let errorMessage = error.message || 'Ошибка отправки кода';
            if (error.data) {
                errorMessage = error.data.error || error.data.message || errorMessage;
            }
            this.showToast(errorMessage, 'error');
            return false;
        }
    }
    
    showAccountSelection(accounts) {
        document.getElementById('forgot-password-form').style.display = 'none';
        document.getElementById('select-account-form').style.display = 'block';
        document.getElementById('auth-title').textContent = 'Выберите аккаунт';
        document.getElementById('auth-subtitle').textContent = 'Найдено несколько аккаунтов';
        
        const accountsList = document.getElementById('accounts-list');
        if (!accountsList) return;
        
        accountsList.innerHTML = '';
        accounts.forEach((account, index) => {
            const accountDiv = document.createElement('div');
            accountDiv.className = 'account-item';
            accountDiv.style.cssText = 'padding: 15px; margin-bottom: 10px; background: rgba(255,255,255,0.05); border: 2px solid var(--border-color); border-radius: 10px; cursor: pointer; transition: all 0.3s;';
            accountDiv.innerHTML = `
                <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 5px;">${account.username}</div>
                <div style="font-size: 0.9rem; color: var(--text-secondary);">${account.email}</div>
            `;
            accountDiv.addEventListener('click', () => {
                this.pendingResetUserId = account.id;
                this.showResetPasswordForm();
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
        this.showForgotPassword();
    }
    
    showResetPasswordForm() {
        document.getElementById('forgot-password-form').style.display = 'none';
        document.getElementById('select-account-form').style.display = 'none';
        document.getElementById('reset-password-form').style.display = 'block';
        document.getElementById('auth-title').textContent = 'Смена пароля';
        document.getElementById('auth-subtitle').textContent = 'Введите код и новый пароль';
        
        const emailDisplay = document.getElementById('reset-email-display');
        if (emailDisplay && this.pendingResetEmail) {
            emailDisplay.textContent = this.pendingResetEmail;
        }
        
        // Очищаем поля
        const codeInput = document.getElementById('reset-code');
        const passwordInput = document.getElementById('reset-password');
        const password2Input = document.getElementById('reset-password2');
        if (codeInput) codeInput.value = '';
        if (passwordInput) passwordInput.value = '';
        if (password2Input) password2Input.value = '';
        
        // Запускаем таймер
        this.startResendResetTimer();
    }
    
    async confirmPasswordReset() {
        const codeInput = document.getElementById('reset-code');
        const passwordInput = document.getElementById('reset-password');
        const password2Input = document.getElementById('reset-password2');
        const codeError = document.getElementById('reset-code-error');
        const passwordError = document.getElementById('reset-password-error');
        
        if (!codeInput || !passwordInput || !password2Input) {
            this.showToast('Ошибка: поля не найдены', 'error');
            return false;
        }
        
        if (!this.pendingResetEmail || !this.pendingResetUserId) {
            this.showToast('Ошибка: данные не найдены. Начните заново', 'error');
            this.showForgotPassword();
            return false;
        }
        
        const code = codeInput.value.trim();
        const password = passwordInput.value;
        const password2 = password2Input.value;
        
        // Валидация кода
        if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
            if (codeError) {
                codeError.textContent = 'Введите 6-значный код';
                codeError.style.display = 'block';
            }
            this.showToast('Введите 6-значный код', 'error');
            return false;
        }
        
        // Валидация пароля
        if (!password || password.length < 6) {
            if (passwordError) {
                passwordError.textContent = 'Пароль должен быть не менее 6 символов';
                passwordError.style.display = 'block';
            }
            this.showToast('Пароль должен быть не менее 6 символов', 'error');
            return false;
        }
        
        if (password !== password2) {
            if (passwordError) {
                passwordError.textContent = 'Пароли не совпадают';
                passwordError.style.display = 'block';
            }
            this.showToast('Пароли не совпадают', 'error');
            return false;
        }
        
        // Подтверждение
        const confirmed = await this.showConfirmDialog(
            'Подтвердите изменение пароля',
            'Вы уверены, что хотите изменить пароль?'
        );
        
        if (!confirmed) {
            return false;
        }
        
        if (codeError) {
            codeError.textContent = '';
            codeError.style.display = 'none';
        }
        if (passwordError) {
            passwordError.textContent = '';
            passwordError.style.display = 'none';
        }
        
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.API_BASE_URL}/reset-password`, {
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
                this.showToast(errorMsg, 'error');
                if (codeError && errorMsg.includes('код')) {
                    codeError.textContent = errorMsg;
                    codeError.style.display = 'block';
                }
                return false;
            }
            
            if (data.success) {
                this.showToast('Пароль успешно изменён! Выполняется вход...', 'success');
                
                // Автоматический вход
                if (data.token && data.user) {
                    this.user = data.user;
                    this.token = data.token;
                    localStorage.setItem('user', JSON.stringify(this.user));
                    localStorage.setItem('token', this.token);
                    this.updateAuthUI();
                    this.closeAuthModal();
                    await this.loadProducts();
                } else {
                    // Если токен не передан, предлагаем войти
                    setTimeout(() => {
                        showLoginForm();
                        this.showToast('Теперь войдите с новым паролем', 'info');
                    }, 2000);
                }
                
                // Очищаем данные
                this.pendingResetEmail = null;
                this.pendingResetUserId = null;
                if (this.resendResetTimer) {
                    clearInterval(this.resendResetTimer);
                    this.resendResetTimer = null;
                }
                
                return true;
            }
            
            this.showToast('Ошибка смены пароля', 'error');
            return false;
        } catch (error) {
            hideLoadingIndicator();
            let errorMessage = error.message || 'Ошибка смены пароля';
            if (error.data) {
                errorMessage = error.data.error || error.data.message || errorMessage;
            }
            this.showToast(errorMessage, 'error');
            return false;
        }
    }
    
    async resendResetCode() {
        if (!this.pendingResetEmail || !this.pendingResetUserId) {
            this.showToast('Ошибка: данные не найдены', 'error');
            return false;
        }
        
        const resendBtn = document.getElementById('resend-reset-code-btn');
        if (resendBtn && resendBtn.disabled) {
            return false;
        }
        
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.API_BASE_URL}/forgot-password`, {
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
                this.showToast(errorMsg, 'error');
                return false;
            }
            
            if (data.success) {
                this.showToast('Новый код отправлен на email', 'success');
                this.startResendResetTimer();
                return true;
            }
            
            this.showToast('Ошибка отправки кода', 'error');
            return false;
        } catch (error) {
            hideLoadingIndicator();
            let errorMessage = error.message || 'Ошибка отправки кода';
            if (error.data) {
                errorMessage = error.data.error || error.data.message || errorMessage;
            }
            this.showToast(errorMessage, 'error');
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
    
    async deleteAccount() {
        // Первое подтверждение
        const firstConfirm = await this.showConfirmDialog(
            'Удалить аккаунт?',
            'Вы уверены? Это действие нельзя отменить. Все ваши данные будут удалены.'
        );
        
        if (!firstConfirm) return;
        
        // Второе подтверждение
        const secondConfirm = await this.showConfirmDialog(
            'Подтвердите удаление',
            'Это последнее предупреждение. Вы действительно хотите удалить аккаунт?'
        );
        
        if (!secondConfirm) return;
        
        // Запрос пароля
        const password = await this.showInputDialog(
            'Подтвердите паролем',
            'Введите ваш пароль для подтверждения удаления аккаунта:',
            'password'
        );
        
        if (!password) return;
        
        try {
            showLoadingIndicator();
            await safeFetch(`${this.API_BASE_URL}/profile`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password })
            });
            
            hideLoadingIndicator();
            this.showToast('Аккаунт удален', 'success');
            this.logout();
        } catch (error) {
            hideLoadingIndicator();
            this.showToast(error.message || 'Ошибка удаления аккаунта', 'error');
            console.error('Delete account error:', error);
        }
    }

    openCartModal() {
        this.renderCart();
        const modal = document.getElementById('cart-modal');
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    closeCartModal() {
        const modal = document.getElementById('cart-modal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }
    
    closeEditProductModal() {
        const modal = document.getElementById('edit-product-modal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }
    
    closeAddProductModal() {
        const modal = document.getElementById('add-product-modal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
        document.body.style.overflow = '';
    }

    // === АДАПТИВНЫЙ РЕНДЕРИНГ ТОВАРОВ ===
    renderProducts() {
        const productsContainer = document.getElementById('products');
        if (!productsContainer) return;
        
        productsContainer.innerHTML = '';
        
        // Проверяем, авторизован ли пользователь
        if (!this.user || !this.token) {
            const loginPrompt = document.createElement('div');
            loginPrompt.className = 'login-prompt';
            loginPrompt.style.cssText = 'text-align:center; padding:60px 20px; grid-column:1/-1;';
            loginPrompt.innerHTML = `
                <div style="max-width:500px; margin:0 auto;">
                    <h2 style="color:var(--neon-red); font-size:2rem; margin-bottom:20px; font-weight:900;">🔒 Доступ ограничен</h2>
                    <p style="color:var(--text-secondary); font-size:1.1rem; margin-bottom:30px; line-height:1.6;">
                        Для просмотра каталога товаров необходимо войти в систему или зарегистрироваться
                    </p>
                    <div style="display:flex; gap:15px; justify-content:center; flex-wrap:wrap;">
                        <button onclick="openAuthModal(); showLoginForm();" class="primary-btn" style="padding:14px 28px; font-size:1rem; min-height:50px;">
                            Войти
                        </button>
                        <button onclick="openAuthModal(); showRegisterForm();" class="secondary-btn" style="padding:14px 28px; font-size:1rem; min-height:50px;">
                            Зарегистрироваться
                        </button>
                    </div>
                </div>
            `;
            productsContainer.appendChild(loginPrompt);
            return;
        }

        if (!this.products || this.products.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-state';
            emptyDiv.style.cssText = 'text-align:center; padding:60px 20px; grid-column:1/-1;';
            
            const p = document.createElement('p');
            p.textContent = 'Товаров пока нет';
            p.style.cssText = 'color:#666; margin-bottom:20px; font-size:1.1rem;';
            
            emptyDiv.appendChild(p);
            productsContainer.appendChild(emptyDiv);
            return;
        }

        this.products.forEach((product, index) => {
            const div = document.createElement('div');
            div.className = 'product';
            div.setAttribute('role', 'listitem');
            div.style.animationDelay = `${index * 0.05}s`;

            // Контейнер для изображения товара (как в профиле)
            const productImageContainer = document.createElement('div');
            productImageContainer.className = 'product-image-container';
            
            const img = document.createElement('img');
            img.className = 'product-image-img';
            img.alt = escapeAttr(product.title);
            img.loading = 'lazy';
            img.width = 300;
            img.height = 220;
            
            const imageFallback = document.createElement('span');
            imageFallback.className = 'product-image-text';
            imageFallback.textContent = (product.title || '?').charAt(0).toUpperCase();
            
            // Устанавливаем изображение, если оно есть
            if (product.image_url && product.image_url !== 'https://via.placeholder.com/300') {
                // Проверяем, что URL валидный и не пустой
                const imageUrl = product.image_url.trim();
                if (imageUrl && imageUrl.startsWith('http')) {
                    img.src = imageUrl;
                    img.style.display = 'block';
                    imageFallback.style.display = 'none';
                    
                    // Обработка ошибки загрузки изображения
                    img.onerror = function() {
                        console.warn('Failed to load product image, using fallback:', imageUrl);
                        this.style.display = 'none';
                        if (imageFallback) {
                            imageFallback.style.display = 'flex';
                        }
                    };
                    
                    // Обработка успешной загрузки
                    img.onload = function() {
                        this.style.display = 'block';
                        if (imageFallback) {
                            imageFallback.style.display = 'none';
                        }
                    };
                } else {
                    // Некорректный URL
                    img.style.display = 'none';
                    imageFallback.style.display = 'flex';
                }
            } else {
                // Нет URL изображения
                img.style.display = 'none';
                imageFallback.style.display = 'flex';
            }
            
            productImageContainer.appendChild(img);
            productImageContainer.appendChild(imageFallback);
            
            const productInfo = document.createElement('div');
            productInfo.className = 'product-info';
            
            const title = document.createElement('h3');
            title.className = 'product-title';
            title.textContent = product.title;
            
            const description = document.createElement('p');
            description.className = 'product-description';
            description.textContent = product.description || '';
            
            const meta = document.createElement('div');
            meta.className = 'product-meta';
            
            const price = document.createElement('span');
            price.className = 'product-price';
            price.textContent = `${parseFloat(product.price).toFixed(2)} ₽`;
            
            const quantity = document.createElement('span');
            quantity.className = 'product-quantity';
            quantity.textContent = `${product.quantity} шт.`;
            
            meta.appendChild(price);
            meta.appendChild(quantity);
            
            const addBtn = document.createElement('button');
            addBtn.className = 'add-to-cart';
            addBtn.dataset.id = product.id;
            addBtn.setAttribute('aria-label', `Добавить ${escapeAttr(product.title)} в корзину`);
            addBtn.textContent = product.quantity === 0 ? 'Нет в наличии' : 'В корзину';
            if (product.quantity === 0) {
                addBtn.disabled = true;
            }
            
            productInfo.appendChild(title);
            productInfo.appendChild(description);
            productInfo.appendChild(meta);
            productInfo.appendChild(addBtn);
            
            div.appendChild(productImageContainer);
            div.appendChild(productInfo);

            productsContainer.appendChild(div);
        });

        // Оптимизация: используем делегирование событий вместо множественных обработчиков
        // Обработчик устанавливается один раз при инициализации
        if (!this.productsEventDelegate) {
            const productsContainerEl = document.getElementById('products');
            if (productsContainerEl) {
                const eventType = this.isMobile ? 'touchend' : 'click';
                productsContainerEl.addEventListener(eventType, (e) => {
                const btn = e.target.closest('.add-to-cart');
                if (btn && !btn.disabled) {
                    if (this.isMobile) e.preventDefault();
                    const id = Number(btn.dataset.id);
                    this.addToCart(id);

                    // Вибрация при добавлении в корзину
                    if ('vibrate' in navigator) {
                        navigator.vibrate(50);
                    }
                }
                });
                this.productsEventDelegate = true;
            }
        }
    }

    // === АДАПТИВНЫЙ CHECKOUT ===
    async checkout() {
        if (!this.cart.length) {
            this.showToast('Корзина пуста!', 'error', 2500);
            return;
        }

        if (!this.user) {
            this.showToast('Для оформления заказа войдите в систему', 'error', 3000);
            this.openAuthModal();
            return;
        }

        // На мобильных устройствах используем отдельную модалку для адреса
        if (this.isMobile) {
            const address = await this.showMobileAddressPrompt();
            if (!address) return;

            await this.processOrder(address);
        } else {
            const address = await this.showInputDialog('Адрес доставки', 'Введите адрес доставки:') || 'Не указан';
            await this.processOrder(address);
        }
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

            // Автофокус на поле ввода
            setTimeout(() => {
                const input = modal.querySelector('#mobile-address-input');
                if (input) input.focus();
            }, 100);
        });
    }

    async processOrder(shippingAddress) {
        try {
            if (!shippingAddress || shippingAddress.trim() === '') {
                this.showToast('Введите адрес доставки', 'error');
                return;
            }
            
            showLoadingIndicator();
            
            const orderData = {
                items: this.cart.map(item => ({
                    id: item.id,
                    quantity: item.quantity,
                    price: item.price
                })),
                shippingAddress: shippingAddress.trim(),
                paymentMethod: 'card'
            };

            const response = await safeFetch(`${this.API_BASE_URL}/orders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(orderData)
            });

            const order = await response.json();
            hideLoadingIndicator();

            if (!response.ok) {
                const errorMsg = order?.error || order?.message || 'Ошибка создания заказа';
                this.showToast(errorMsg, 'error');
                return;
            }

            this.showToast(`Заказ #${order.id.substring(0, 8)} оформлен!`, 'success', 5000);

            // Очищаем корзину
            this.cart = [];
            this.saveCart();
            this.updateCartInfo();
            this.renderCart();

            // Обновляем заказы в профиле
            await this.loadOrders();

            // Закрываем модальное окно с анимацией
            setTimeout(() => {
                this.closeAllModals();
            }, 1500);

        } catch (error) {
            hideLoadingIndicator();
            let errorMessage = error.message || 'Ошибка создания заказа';
            if (error.data) {
                errorMessage = error.data.error || error.data.message || errorMessage;
            }
            this.showToast(errorMessage, 'error');
            console.error('Process order error:', error);
        }
    }

    // === ОБНОВЛЕННЫЙ UI ДЛЯ МОБИЛЬНЫХ ===
    updateAuthUI() {
        const authBtn = document.getElementById('auth-btn');
        const profileBtn = document.getElementById('profile-btn');
        const adminBtn = document.getElementById('admin-btn');
        const cartBtn = document.getElementById('cart-btn');

        if (this.user) {
            if (authBtn) authBtn.style.display = 'none';
            if (profileBtn) {
                profileBtn.style.display = 'flex';
            }
            if (adminBtn) {
                adminBtn.style.display = this.user.isAdmin ? 'flex' : 'none';
            }
            if (cartBtn) cartBtn.style.display = 'flex';
            
            // Загружаем товары после авторизации
            if (!this.products || this.products.length === 0) {
                this.loadProducts();
            }
        } else {
            if (authBtn) authBtn.style.display = 'flex';
            if (profileBtn) profileBtn.style.display = 'none';
            if (adminBtn) adminBtn.style.display = 'none';
            if (cartBtn) cartBtn.style.display = 'none';
        }
        
        // Перерисовываем товары с учетом авторизации
        this.renderProducts();
    }
    
    setupAgeVerification() {
        // Проверяем, было ли уже подтверждение возраста
        const ageVerified = localStorage.getItem('ageVerified');
        if (ageVerified === 'true') {
            const modal = document.getElementById('age-verification-modal');
            if (modal) modal.style.display = 'none';
            return;
        }
        
        const yesBtn = document.getElementById('age-yes');
        const noBtn = document.getElementById('age-no');
        
        if (yesBtn) {
            yesBtn.addEventListener('click', () => {
                localStorage.setItem('ageVerified', 'true');
                const modal = document.getElementById('age-verification-modal');
                if (modal) modal.style.display = 'none';
            });
        }
        
        if (noBtn) {
            noBtn.addEventListener('click', () => {
                alert('Доступ к сайту ограничен для лиц младше 18 лет.');
                window.location.href = 'https://www.google.com';
            });
        }
    }
    

    renderCart() {
        const cartItems = document.getElementById('cart-items');
        const cartTotalModal = document.getElementById('cart-total-modal');
        
        // Очищаем контейнер перед рендерингом
        if (cartItems) cartItems.innerHTML = '';

        if (!this.cart.length) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-cart';
            emptyDiv.style.cssText = 'text-align:center; padding:40px 20px;';
            
            const p = document.createElement('p');
            p.textContent = 'Корзина пуста';
            p.style.cssText = 'color:#666; margin-bottom:15px; font-size:1.1rem;';
            
            const btn = document.createElement('button');
            btn.textContent = 'Посмотреть товары';
            btn.className = 'browse-products-btn';
            btn.addEventListener('click', () => {
                this.closeCartModal();
                this.loadProducts();
            });
            
            emptyDiv.appendChild(p);
            emptyDiv.appendChild(btn);
            if (cartItems) cartItems.appendChild(emptyDiv);
            if (cartTotalModal) cartTotalModal.textContent = '0 ₽';
            return;
        }

        let total = 0;

        this.cart.forEach(item => {
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

        // Оптимизация: используем делегирование событий
        const cartItemsContainer = document.getElementById('cart-items');
        if (cartItemsContainer) {
            const eventType = this.isMobile ? 'touchend' : 'click';
            cartItemsContainer.addEventListener(eventType, (e) => {
                if (this.isMobile) e.preventDefault();
                
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
            });
        }
    }

    // === ОБНОВЛЕННЫЕ ОБРАБОТЧИКИ СОБЫТИЙ ===
    setupEventListeners() {
        // Кнопка корзины
        const cartBtn = document.getElementById('cart-btn');
        if (cartBtn) {
            const eventType = this.isMobile ? 'touchend' : 'click';
            cartBtn.addEventListener(eventType, (e) => {
                if (this.isMobile) e.preventDefault();
                this.openCartModal();
            });
        }

        // Кнопка админ-панели
        const adminBtn = document.getElementById('admin-btn');
        if (adminBtn) {
            adminBtn.addEventListener('click', () => {
                this.openAdminPanel();
            });
        }
        
        // Закрытие модальных окон
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeAllModals();
                }
            });
        });

        // Форма входа
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = document.getElementById('login-username').value;
                const password = document.getElementById('login-password').value;
                await this.login(username, password);
            });
        }

        // Форма регистрации
        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = document.getElementById('register-username').value;
                const email = document.getElementById('register-email').value;
                const password = document.getElementById('register-password').value;
                const password2 = document.getElementById('register-password2').value;
                const fullName = document.getElementById('register-fullname').value;
                
                // Проверка паролей
                if (password !== password2) {
                    const passwordError = document.getElementById('password-error');
                    if (passwordError) {
                        passwordError.textContent = 'Пароли не совпадают';
                        passwordError.style.display = 'block';
                    }
                    return;
                }
                
                if (password.length < 6) {
                    const passwordError = document.getElementById('password-error');
                    if (passwordError) {
                        passwordError.textContent = 'Пароль должен быть не менее 6 символов';
                        passwordError.style.display = 'block';
                    }
                    return;
                }
                
                await this.register(username, email, password, fullName);
            });
        }
        
        // Обработчики Enter для полей ввода регистрации
        const usernameInput = document.getElementById('register-username');
        const emailInput = document.getElementById('register-email');
        const fullNameInput = document.getElementById('register-fullname');
        const password2Input = document.getElementById('register-password2');
        
        if (usernameInput) {
            usernameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.nextRegisterStep();
                }
            });
        }
        
        if (emailInput) {
            emailInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.nextRegisterStep();
                }
            });
        }
        
        if (fullNameInput) {
            fullNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.nextRegisterStep();
                }
            });
        }
        
        if (password2Input) {
            password2Input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const form = document.getElementById('register-form');
                    if (form) {
                        form.requestSubmit();
                    }
                }
            });
        }

        // Обработчик Enter для поля кода подтверждения
        const codeInput = document.getElementById('register-code');
        if (codeInput) {
            codeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    shop.confirmEmailCode();
                }
            });
        }
        
        // Обработчики для пошаговой регистрации
        this.setupRegisterSteps();

        // Форма редактирования товара
        const editProductForm = document.getElementById('edit-product-form');
        if (editProductForm) {
            editProductForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveProduct();
            });
        }
        
        // Форма добавления товара
        const addProductForm = document.getElementById('add-product-form');
        if (addProductForm) {
            addProductForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveNewProduct();
            });
        }
        
        // Обработчики для админ-табов
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                if (tabName) {
                    switchAdminTab(tabName, e);
                }
            });
        });
        
        // Очистка корзины
        const clearCartBtn = document.getElementById('clear-cart');
        if (clearCartBtn) {
            clearCartBtn.addEventListener('click', () => {
                if (this.cart.length === 0) return;

                // На мобильных используем кастомное подтверждение
                if (this.isMobile) {
                    this.showMobileConfirm('Очистить корзину?', 
                        'Вы уверены, что хотите удалить все товары из корзины?',
                        () => {
                            this.cart = [];
                            this.saveCart();
                            this.updateCartInfo();
                            this.renderCart();
                            this.showToast('Корзина очищена', 'error', 2000);
                        });
                } else {
                    this.showConfirmDialog('Очистить корзину?', 'Вы уверены, что хотите удалить все товары из корзины?').then(confirmed => {
                        if (confirmed) {
                            this.cart = [];
                            this.saveCart();
                            this.updateCartInfo();
                            this.renderCart();
                            this.showToast('Корзина очищена', 'error', 2000);
                        }
                    });
                }
            });
        }

        // Закрытие по Escape (только на десктопе)
        if (!this.isMobile) {
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.closeAllModals();
                }
            });
        }

        // Обработка изменения ориентации
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                // Пересчитываем позиции и размеры
                this.isMobile = this.checkIsMobile();
            }, 300);
        });

        // Предотвращение скролла при открытых модалках на iOS
        // Используем более безопасный подход
        let isModalOpen = false;
        document.addEventListener('touchmove', (e) => {
            if (isModalOpen) {
                // Проверяем, что скролл происходит внутри модалки
                const modal = e.target.closest('.modal');
                const modalContent = e.target.closest('.modal-content');
                if (!modalContent && modal) {
                    e.preventDefault();
                }
            }
        }, { passive: false });
        
        // Отслеживаем открытие/закрытие модалок
        const observer = new MutationObserver(() => {
            isModalOpen = document.querySelector('.modal[style*="display: block"]') !== null;
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    }

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
            
            // Закрытие по клику вне модалки
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
            
            // Enter для подтверждения
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
            
            // Автофокус
            setTimeout(() => input.focus(), 100);
            
            // Закрытие по клику вне модалки
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                    resolve(null);
                }
            });
        });
    }
    
    showMobileConfirm(title, message, onConfirm) {
        this.showConfirmDialog(title, message).then(confirmed => {
            if (confirmed && onConfirm) {
                onConfirm();
            }
        });
    }

    // === СОХРАНЕНИЕ ДАННЫХ ===
    saveCart() {
        try {
            localStorage.setItem('cart', JSON.stringify(this.cart));
        } catch (e) {
            // Если localStorage полон, очищаем старые данные
            if (e.name === 'QuotaExceededError') {
                localStorage.clear();
                localStorage.setItem('cart', JSON.stringify(this.cart));
            }
        }
    }

    // === ОБНОВЛЕНИЕ КОРЗИНЫ ===
    updateCartInfo() {
        const totalItems = this.cart.reduce((sum, item) => sum + item.quantity, 0);
        const totalPrice = this.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

        const cartCount = document.getElementById('cart-count');
        const cartTotal = document.getElementById('cart-total');
        const cartBadge = document.getElementById('cart-badge');

        if (cartCount) cartCount.textContent = totalItems;
        if (cartTotal) cartTotal.textContent = totalPrice.toFixed(2);
        
        // Обновляем badge на кнопке корзины
        if (cartBadge) {
            if (totalItems > 0) {
                cartBadge.textContent = totalItems > 99 ? '99+' : totalItems;
                cartBadge.style.display = 'flex';
            } else {
                cartBadge.textContent = '';
                cartBadge.style.display = 'none';
            }
        }
    }

    // === ОСТАЛЬНЫЕ МЕТОДЫ (без изменений, но с учетом мобильных) ===
    // === ОСТАЛЬНЫЕ МЕТОДЫ ===
    async login(username, password) {
        try {
            const response = await safeFetch(`${this.API_BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            this.user = data.user;
            this.token = data.token;

            localStorage.setItem('user', JSON.stringify(data.user));
            localStorage.setItem('token', data.token);

            this.updateAuthUI();
            this.showToast('Вход выполнен успешно!', 'success');
            this.closeAuthModal();
            
            // Загружаем товары после входа
            await this.loadProducts();

            return true;

        } catch (error) {
            this.showToast(error.message, 'error');
            return false;
        }
    }

    setupRegisterSteps() {
        this.currentRegisterStep = 1;
        this.registerData = {
            username: '',
            email: '',
            fullName: '',
            password: ''
        };
        // Сбрасываем флаги при сбросе формы
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
            const response = await safeFetch(`${this.API_BASE_URL}/check-username/${encodeURIComponent(username.trim())}`, {
                showLoading: false
            });
            return await response.json();
        } catch (error) {
            return { available: false, error: 'Ошибка проверки имени пользователя' };
        }
    }
    
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
            
            // Проверка на существование
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
            
            // Регистрируем пользователя БЕЗ пароля и отправляем код
            await this.registerUserWithoutPassword();
            return; // Не переходим дальше, код покажет следующий шаг
        } else if (currentStep === 4) {
            // Шаг 4: Полное имя (необязательно)
            const fullName = document.getElementById('register-fullname')?.value.trim();
            this.registerData.fullName = fullName;
        } else if (currentStep === 5) {
            // Шаг 5: Пароль
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
            // На шаге 5 не переходим дальше, кнопка сама вызовет completeRegistrationWithPassword
            return;
        }
        
        // Переход между шагами (только для шагов 1-4)
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
        // Переходим на шаг 5 (пароль)
        this.currentRegisterStep = 5;
        this.updateRegisterStepDisplay();
    }

    async completeRegistrationWithPassword() {
        // Получаем пароль из полей ввода
        const password = document.getElementById('register-password')?.value;
        const password2 = document.getElementById('register-password2')?.value;
        const passwordError = document.getElementById('password-error');
        const fullName = document.getElementById('register-fullname')?.value.trim() || '';
        
        // Валидация пароля
        if (!password) {
            if (passwordError) {
                passwordError.textContent = 'Введите пароль';
                passwordError.style.display = 'block';
            }
            this.showToast('Введите пароль', 'error');
            return false;
        }
        
        if (password.length < 6) {
            if (passwordError) {
                passwordError.textContent = 'Пароль должен быть не менее 6 символов';
                passwordError.style.display = 'block';
            }
            this.showToast('Пароль должен быть не менее 6 символов', 'error');
            return false;
        }
        
        if (password !== password2) {
            if (passwordError) {
                passwordError.textContent = 'Пароли не совпадают';
                passwordError.style.display = 'block';
            }
            this.showToast('Пароли не совпадают', 'error');
            return false;
        }

        if (passwordError) {
            passwordError.textContent = '';
            passwordError.style.display = 'none';
        }

        if (!this.pendingRegistrationToken || !this.pendingRegistrationUser) {
            this.showToast('Ошибка: данные регистрации не найдены. Начните регистрацию заново', 'error');
            // Сбрасываем форму
            this.setupRegisterSteps();
            this.updateRegisterStepDisplay();
            return false;
        }

        try {
            // Обновляем пароль и полное имя
            showLoadingIndicator();
            const response = await safeFetch(`${this.API_BASE_URL}/profile`, {
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

            const data = await response.json();
            hideLoadingIndicator();

            if (data.user) {
                // Автоматически входим в аккаунт
                this.user = data.user;
                this.token = this.pendingRegistrationToken;
                localStorage.setItem('user', JSON.stringify(this.user));
                localStorage.setItem('token', this.token);
                this.updateAuthUI();
                this.showToast('Регистрация завершена! Вы автоматически вошли в аккаунт', 'success');
                this.closeAuthModal();
                await this.loadProducts();
                
                // Сброс формы регистрации
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
                this.showToast(data.error || 'Ошибка завершения регистрации', 'error');
                return false;
            }
        } catch (error) {
            hideLoadingIndicator();
            // Улучшенная обработка ошибок
            let errorMessage = error.message || 'Ошибка завершения регистрации';
            
            // Если токен недействителен, возможно пользователь уже зарегистрирован
            if (errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('токен')) {
                errorMessage = 'Сессия истекла. Пользователь может быть уже зарегистрирован. Попробуйте войти.';
                this.setupRegisterSteps();
                this.updateRegisterStepDisplay();
                showLoginForm();
            }
            
            this.showToast(errorMessage, 'error');
            return false;
        }
    }

    async completeRegistration() {
        const fullName = document.getElementById('register-fullname')?.value.trim();
        
        // Обновляем полное имя, если оно было введено
        if (fullName && this.pendingRegistrationUser) {
            try {
                const response = await safeFetch(`${this.API_BASE_URL}/profile`, {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.pendingRegistrationToken}`
                    },
                    body: JSON.stringify({ fullName })
                });

                const data = await response.json();
                if (data.user) {
                    this.pendingRegistrationUser = data.user;
                }
            } catch (error) {
                console.log('Error updating full name:', error);
                // Продолжаем даже если не удалось обновить имя
            }
        }

        // Автоматически входим в аккаунт
        if (this.pendingRegistrationToken && this.pendingRegistrationUser) {
            this.user = this.pendingRegistrationUser;
            this.token = this.pendingRegistrationToken;
            localStorage.setItem('user', JSON.stringify(this.user));
            localStorage.setItem('token', this.token);
            this.updateAuthUI();
            this.showToast('Регистрация завершена! Вы автоматически вошли в аккаунт', 'success');
            this.closeAuthModal();
            await this.loadProducts();
            
            // Сброс формы регистрации
            this.setupRegisterSteps();
            this.updateRegisterStepDisplay();
            this.pendingRegistrationToken = null;
            this.pendingRegistrationUser = null;
        }
    }
    
    updateRegisterStepDisplay() {
        const steps = document.querySelectorAll('.register-step');
        const currentStep = this.currentRegisterStep || 1;
        
        steps.forEach((step, index) => {
            const stepNum = index + 1;
            if (stepNum === currentStep) {
                step.classList.add('active');
                step.style.display = 'flex';
            } else {
                step.classList.remove('active');
                step.style.display = 'none';
            }
        });
        
        // Обновляем индикатор шагов
        this.updateStepIndicator();
    }
    
    updateStepIndicator() {
        const currentStep = this.currentRegisterStep || 1;
        const indicators = document.querySelectorAll('.step-indicator');
        
        indicators.forEach((indicator) => {
            // Добавляем атрибут для отображения текущего шага
            indicator.setAttribute('data-current-step', currentStep);
            
            const numbers = indicator.querySelectorAll('.step-number');
            const lines = indicator.querySelectorAll('.step-line');
            
            // Обрабатываем только числа (каждое второе - это число, между ними линии)
            numbers.forEach((num, i) => {
                const stepNum = i + 1; // Номер шага (1, 2, 3, 4)
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
            
            // Обрабатываем линии между шагами
            lines.forEach((line, i) => {
                const stepNum = i + 1; // Номер линии (1, 2, 3) - между шагами
                line.classList.remove('completed');
                if (stepNum < currentStep) {
                    line.classList.add('completed');
                }
            });
        });
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

    async registerUserWithoutPassword() {
        try {
            const username = this.registerData.username;
            const email = this.registerData.email;
            
            if (!username || !email) {
                this.showToast('Заполните все поля', 'error');
                return false;
            }

            showLoadingIndicator();
            let response, data;
            
            try {
                response = await safeFetch(`${this.API_BASE_URL}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, password: 'temp_password_will_be_changed', fullName: null })
                });

                data = await response.json();
            } catch (fetchError) {
                hideLoadingIndicator();
                // Если ошибка сети или сервера, проверяем, не создался ли пользователь
                if (fetchError.message?.includes('400') || fetchError.message?.includes('уже существует')) {
                    this.showFieldError('username-error', 'Пользователь с таким именем уже существует');
                    this.showToast('Пользователь с таким именем уже существует. Попробуйте войти или используйте другое имя', 'error');
                    this.currentRegisterStep = 1;
                    this.updateRegisterStepDisplay();
                    return false;
                }
                throw fetchError;
            }
            
            hideLoadingIndicator();

            // Проверяем, не существует ли уже пользователь
            if (!response.ok) {
                const errorMsg = data?.error || data?.message || 'Ошибка регистрации';
                
                // Если пользователь уже существует
                if (response.status === 400 || response.status === 409) {
                    if (errorMsg.includes('уже существует') || errorMsg.includes('занято') || errorMsg.includes('duplicate') || errorMsg.includes('unique')) {
                        this.showFieldError('username-error', errorMsg);
                        this.showToast(errorMsg + '. Попробуйте войти или используйте другое имя', 'error');
                        // Возвращаемся на шаг 1
                        this.currentRegisterStep = 1;
                        this.updateRegisterStepDisplay();
                        return false;
                    }
                }
                
                // Другие ошибки
                this.showToast(errorMsg, 'error');
                return false;
            }

            // Если требуется подтверждение email
            if (data.needsCodeConfirmation) {
                this.pendingVerificationEmail = data.email;
                this.pendingRegistrationToken = data.token;
                this.pendingRegistrationUser = data.user;
                // Показываем шаг 3 (ввод кода)
                this.currentRegisterStep = 3;
                this.updateRegisterStepDisplay();
                // Устанавливаем email в поле
                const emailEl = document.getElementById('verification-email');
                if (emailEl) {
                    emailEl.textContent = data.email;
                }
                // Запускаем таймер для повторной отправки
                this.startResendCodeTimer();
                this.showToast('Код подтверждения отправлен на почту', 'success');
                return true;
            }

            this.showToast(data.error || 'Ошибка регистрации', 'error');
            return false;

        } catch (error) {
            hideLoadingIndicator();
            
            // Улучшенная обработка ошибок
            let errorMessage = error.message || 'Ошибка регистрации';
            const errorStatus = error.status;
            const errorData = error.data;
            
            // Если пользователь уже существует (из статуса или сообщения)
            if (errorStatus === 400 || errorStatus === 409 || 
                errorMessage.includes('уже существует') || 
                errorMessage.includes('занято') || 
                errorMessage.includes('duplicate') || 
                errorMessage.includes('unique') ||
                (errorData && (errorData.error?.includes('уже существует') || errorData.error?.includes('занято')))) {
                
                const finalErrorMsg = errorData?.error || errorData?.message || errorMessage || 'Пользователь с таким именем уже существует';
                this.showFieldError('username-error', finalErrorMsg);
                this.showToast(finalErrorMsg + '. Попробуйте войти или используйте другое имя', 'error');
                this.currentRegisterStep = 1;
                this.updateRegisterStepDisplay();
                return false;
            }
            
            // Если ошибка сети, возможно пользователь уже создан
            if (errorMessage.includes('Network') || errorMessage.includes('fetch') || errorMessage.includes('сети')) {
                this.showToast('Ошибка сети. Если регистрация не завершилась, попробуйте войти с вашими данными', 'error');
            } else {
                this.showToast(errorMessage, 'error');
            }
            return false;
        }
    }

    async register(username, email, password, fullName) {
        try {
            const response = await safeFetch(`${this.API_BASE_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password, fullName })
            });

            const data = await response.json();

            // Если требуется подтверждение email
            if (data.needsCodeConfirmation) {
                this.pendingVerificationEmail = data.email;
                // Показываем шаг 4 (ввод кода)
                this.currentRegisterStep = 4;
                this.updateRegisterStepDisplay();
                // Устанавливаем email в поле
                const emailEl = document.getElementById('verification-email');
                if (emailEl) {
                    emailEl.textContent = data.email;
                }
                // Запускаем таймер для повторной отправки
                this.startResendCodeTimer();
                this.showToast('Код подтверждения отправлен на почту', 'success');
                return true;
            }

            // Старая логика (если код не требуется)
            this.user = data.user;
            this.token = data.token;

            localStorage.setItem('user', JSON.stringify(data.user));
            localStorage.setItem('token', data.token);

            this.updateAuthUI();
            this.showToast('Регистрация успешна!', 'success');
            this.closeAuthModal();
            
            // Загружаем товары после регистрации
            await this.loadProducts();
            
            // Сброс формы регистрации
            this.setupRegisterSteps();
            this.updateRegisterStepDisplay();

            return true;

        } catch (error) {
            this.showToast(error.message, 'error');
            return false;
        }
    }

    async confirmEmailCode() {
        // Защита от повторных запросов
        if (this.isConfirmingCode) {
            return false;
        }
        
        const codeInput = document.getElementById('register-code');
        const codeError = document.getElementById('code-error');
        
        if (!codeInput) {
            this.showToast('Ошибка: поле ввода кода не найдено', 'error');
            return false;
        }
        
        if (!this.pendingVerificationEmail) {
            this.showToast('Ошибка: email не найден. Начните регистрацию заново', 'error');
            // Возвращаемся на шаг 2
            this.currentRegisterStep = 2;
            this.updateRegisterStepDisplay();
            return false;
        }

        const code = codeInput.value.trim();
        
        // Валидация кода
        if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
            if (codeError) {
                codeError.textContent = 'Введите 6-значный код';
                codeError.style.display = 'block';
            }
            this.showToast('Введите 6-значный код', 'error');
            return false;
        }

        if (codeError) {
            codeError.textContent = '';
            codeError.style.display = 'none';
        }

        // Устанавливаем флаг, чтобы предотвратить повторные запросы
        this.isConfirmingCode = true;
        
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.API_BASE_URL}/confirm-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: this.pendingVerificationEmail,
                    code: code
                })
            });

            const data = await response.json();
            hideLoadingIndicator();

            // Проверяем статус ответа
            if (!response.ok) {
                const errorMsg = data?.error || data?.message || 'Ошибка подтверждения';
                this.showToast(errorMsg, 'error');
                if (codeError) {
                    codeError.textContent = errorMsg;
                    codeError.style.display = 'block';
                }
                return false;
            }

            if (data.success) {
                // Сохраняем токен и данные пользователя для завершения регистрации
                if (data.token && data.user) {
                    this.pendingRegistrationToken = data.token;
                    this.pendingRegistrationUser = data.user;
                    
                    // Переходим на шаг 4 (полное имя)
                    this.currentRegisterStep = 4;
                    this.updateRegisterStepDisplay();
                    
                    this.showToast('Email подтверждён! Завершите регистрацию', 'success');
                    
                    // Очищаем поле кода
                    if (codeInput) {
                        codeInput.value = '';
                    }
                } else {
                    this.showToast('Email успешно подтверждён! Теперь можно войти', 'success');
                    showLoginForm();
                }
                
                // Очищаем таймер
                if (this.resendCodeTimer) {
                    clearInterval(this.resendCodeTimer);
                    this.resendCodeTimer = null;
                }
                
                // Очищаем pendingVerificationEmail только после успешного подтверждения
                this.pendingVerificationEmail = null;
                
                // Сбрасываем флаг
                this.isConfirmingCode = false;
                
                return true;
            } else {
                const errorMsg = data.error || data.message || 'Ошибка подтверждения';
                this.showToast(errorMsg, 'error');
                if (codeError) {
                    codeError.textContent = errorMsg;
                    codeError.style.display = 'block';
                }
                
                // Сбрасываем флаг при ошибке
                this.isConfirmingCode = false;
                
                return false;
            }

        } catch (error) {
            hideLoadingIndicator();
            
            // Улучшенная обработка ошибок
            let errorMessage = error.message || 'Ошибка подтверждения';
            
            // Если ошибка сети
            if (errorMessage.includes('Network') || errorMessage.includes('fetch') || errorMessage.includes('сети')) {
                errorMessage = 'Ошибка сети. Проверьте подключение и попробуйте снова';
            }
            
            // Если ошибка от сервера, используем данные из error.data
            if (error.data) {
                errorMessage = error.data.error || error.data.message || errorMessage;
            }
            
            this.showToast(errorMessage, 'error');
            if (codeError) {
                codeError.textContent = errorMessage;
                codeError.style.display = 'block';
            }
            
            // Сбрасываем флаг при ошибке
            this.isConfirmingCode = false;
            
            return false;
        }
    }

    async resendVerificationCode() {
        if (!this.pendingVerificationEmail) {
            this.showToast('Ошибка: email не найден. Начните регистрацию заново', 'error');
            // Возвращаемся на шаг 2
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
            const response = await safeFetch(`${this.API_BASE_URL}/resend-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: this.pendingVerificationEmail
                })
            });

            const data = await response.json();
            hideLoadingIndicator();
            
            // Проверяем статус ответа
            if (!response.ok) {
                const errorMsg = data?.error || data?.message || 'Ошибка отправки кода';
                this.showToast(errorMsg, 'error');
                return false;
            }

            if (data.success) {
                this.showToast('Новый код отправлен на почту', 'success');
                this.startResendCodeTimer();
                return true;
            } else {
                const errorMsg = data.error || data.message || 'Ошибка отправки кода';
                this.showToast(errorMsg, 'error');
                return false;
            }

        } catch (error) {
            hideLoadingIndicator();
            
            // Улучшенная обработка ошибок
            let errorMessage = error.message || 'Ошибка отправки кода';
            
            // Если ошибка сети
            if (errorMessage.includes('Network') || errorMessage.includes('fetch') || errorMessage.includes('сети')) {
                errorMessage = 'Ошибка сети. Проверьте подключение и попробуйте снова';
            }
            
            // Если ошибка от сервера, используем данные из error.data
            if (error.data) {
                errorMessage = error.data.error || error.data.message || errorMessage;
            }
            
            this.showToast(errorMessage, 'error');
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

    async sendEmailVerificationCode(email) {
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.API_BASE_URL}/send-email-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const data = await response.json();
            
            // Проверяем статус ответа
            if (!response.ok) {
                hideLoadingIndicator();
                const errorMsg = data?.error || data?.message || 'Ошибка отправки кода';
                this.showToast(errorMsg, 'error');
                return false;
            }
            
            hideLoadingIndicator();

            if (data.success) {
                this.pendingVerificationEmail = email;
                this.showToast('✅ Код подтверждения отправлен на почту', 'success');
                return true;
            } else {
                // Не показываем ошибку, если email уже зарегистрирован - это нормально
                if (!data.error || (!data.error.includes('уже зарегистрирован') && !data.error.includes('Подождите'))) {
                    this.showToast(data.error || data.message || 'Ошибка отправки кода', 'error');
                } else if (data.error.includes('Подождите')) {
                    this.showToast(data.message || data.error, 'warning');
                }
                return false;
            }
        } catch (error) {
            hideLoadingIndicator();
            // Не показываем критическую ошибку, код будет отправлен при регистрации
            console.log('Email code send error (non-critical):', error.message);
        }
    }

    async validateToken() {
        try {
            const response = await safeFetch(`${this.API_BASE_URL}/validate-token`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const data = await response.json();
            this.user = data.user;
            
            return true;

        } catch (error) {
            console.error('Token validation error:', error);
            this.logout();
            return false;
        }
    }

    logout() {
        this.user = null;
        this.token = null;

        localStorage.removeItem('user');
        localStorage.removeItem('token');

        this.updateAuthUI();
        this.showToast('Вы вышли из системы', 'info');
        this.closeProfileModal();
    }

    async loadProducts() {
        const productsContainer = document.getElementById('products');
        if (!productsContainer) return;
        
        productsContainer.innerHTML = '<div class="loading">Загрузка товаров...</div>';
        showLoadingIndicator();

        try {
            const url = `${this.API_BASE_URL}/products`;
            const response = await safeFetch(url, { showLoading: false });

            this.products = await response.json();
            this.renderProducts();
            hideLoadingIndicator();

        } catch (error) {
            hideLoadingIndicator();
            console.error('Load products error:', error);
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'text-align:center; padding:50px 20px;';
            
            const errorP = document.createElement('p');
            errorP.textContent = error.message || 'Ошибка загрузки товаров';
            errorP.style.cssText = 'color:#ff3366; margin-bottom:20px; font-size:1rem;';
            
            const retryBtn = document.createElement('button');
            retryBtn.className = 'retry-button';
            retryBtn.textContent = 'Повторить';
            retryBtn.addEventListener('click', () => this.loadProducts());
            
            errorDiv.appendChild(errorP);
            errorDiv.appendChild(retryBtn);
            productsContainer.innerHTML = '';
            productsContainer.appendChild(errorDiv);
            this.showToast(error.message || 'Ошибка загрузки товаров', 'error');
        }
    }

    addToCart(id) {
        const product = this.products.find(p => p.id === id);
        if (!product) return;

        const existing = this.cart.find(i => i.id === id);

        if (existing) {
            if (existing.quantity >= product.quantity) {
                this.showToast(`Нельзя добавить больше, чем есть в наличии`, 'error');
                return;
            }
            existing.quantity += 1;
            this.showToast(`+1 × ${product.title}`, 'success', 2000);
        } else {
            this.cart.push({ 
                ...product, 
                quantity: 1 
            });
            this.showToast(`${product.title} добавлен в корзину!`, 'success', 2500);
        }

        this.saveCart();
        this.updateCartInfo();

        // Вибрация на мобильных
        if ('vibrate' in navigator) {
            navigator.vibrate([50, 30, 50]);
        }
    }

    changeQuantity(id, delta) {
        const item = this.cart.find(i => i.id === id);
        if (!item) return;

        const product = this.products.find(p => p.id === id);

        if (delta > 0 && item.quantity >= product.quantity) {
            this.showToast(`Нельзя добавить больше, чем есть в наличии`, 'error');
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
        const itemIndex = this.cart.findIndex(i => i.id === id);
        if (itemIndex === -1) return;

        const [removedItem] = this.cart.splice(itemIndex, 1);
        this.showToast(`${removedItem.title} удалён из корзины`, 'error', 2000);

        this.saveCart();
        this.updateCartInfo();
        this.renderCart();
    }

    removeToast(toastId) {
        const toast = document.getElementById(toastId);
        if (!toast) return;

        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }

    async loadUserOrders() {
        if (!this.user) return;

        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.API_BASE_URL}/orders`, {
                headers: { 'Authorization': `Bearer ${this.token}` },
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

        // Очищаем список перед рендерингом
        ordersList.innerHTML = '';

        if (!orders || orders.length === 0) {
            const emptyP = document.createElement('p');
            emptyP.textContent = 'Заказов пока нет';
            emptyP.style.cssText = 'color:#666; text-align:center; padding:20px;';
            ordersList.appendChild(emptyP);
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
    
    async showOrderDetails(order) {
        // Загружаем полную информацию о заказе
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.API_BASE_URL}/orders/${order.id}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            const fullOrder = await response.json();
            hideLoadingIndicator();
            
            if (!response.ok) {
                this.showToast(fullOrder.error || 'Ошибка загрузки заказа', 'error');
                return;
            }
            
            this.renderOrderDetailsModal(fullOrder);
        } catch (error) {
            hideLoadingIndicator();
            this.showToast(error.message || 'Ошибка загрузки заказа', 'error');
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
                const productName = item.products ? item.products.title : `Товар #${item.product_id}`;
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
                const confirmed = await this.showConfirmDialog(
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
            const response = await safeFetch(`${this.API_BASE_URL}/orders/${orderId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ shipping_address: newAddress })
            });
            
            const data = await response.json();
            hideLoadingIndicator();
            
            if (!response.ok) {
                this.showToast(data.error || 'Ошибка обновления адреса', 'error');
                return false;
            }
            
            this.showToast('Адрес успешно обновлён', 'success');
            // Обновляем заказы
            await this.loadOrders();
            return true;
        } catch (error) {
            hideLoadingIndicator();
            this.showToast(error.message || 'Ошибка обновления адреса', 'error');
            return false;
        }
    }
    
    async updateOrderDeliveryTime(orderId, newTime) {
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.API_BASE_URL}/orders/${orderId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ delivery_time: newTime })
            });
            
            const data = await response.json();
            hideLoadingIndicator();
            
            if (!response.ok) {
                this.showToast(data.error || 'Ошибка обновления времени', 'error');
                return false;
            }
            
            this.showToast('Время доставки успешно обновлено', 'success');
            // Обновляем заказы
            await this.loadOrders();
            return true;
        } catch (error) {
            hideLoadingIndicator();
            this.showToast(error.message || 'Ошибка обновления времени', 'error');
            return false;
        }
    }
    
    async cancelOrder(orderId) {
        try {
            showLoadingIndicator();
            const response = await safeFetch(`${this.API_BASE_URL}/orders/${orderId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            const data = await response.json();
            hideLoadingIndicator();
            
            if (!response.ok) {
                this.showToast(data.error || 'Ошибка отмены заказа', 'error');
                return false;
            }
            
            this.showToast('Заказ успешно отменён', 'success');
            // Обновляем заказы
            await this.loadOrders();
            return true;
        } catch (error) {
            hideLoadingIndicator();
            this.showToast(error.message || 'Ошибка отмены заказа', 'error');
            return false;
        }
    }
}

// Глобальные функции для вызова из HTML
function openAuthModal() {
    shop.openAuthModal();
}

function closeAuthModal() {
    shop.closeAuthModal();
}

function openProfileModal() {
    shop.openProfileModal();
}

function closeProfileModal() {
    shop.closeProfileModal();
}

function openCartModal() {
    shop.openCartModal();
}

function closeCartModal() {
    shop.closeCartModal();
}

function openAdminPanel() {
    shop.openAdminPanel();
}

function closeAdminPanel() {
    shop.closeAdminPanel();
}

function closeEditProductModal() {
    shop.closeEditProductModal();
}

function closeAddProductModal() {
    shop.closeAddProductModal();
}

function addNewProduct() {
    shop.addNewProduct();
}


function showLoginForm() {
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('auth-title').textContent = 'Вход';
    document.getElementById('auth-subtitle').textContent = 'Войдите в свой аккаунт';
}

function showRegisterForm() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('auth-title').textContent = 'Регистрация';
    document.getElementById('auth-subtitle').textContent = 'Создайте новый аккаунт';
    
    // Сброс формы регистрации
    if (shop) {
        shop.setupRegisterSteps();
        shop.updateRegisterStepDisplay();
    }
}

function logout() {
    shop.logout();
}

function checkout() {
    shop.checkout();
}

function loadProducts() {
    shop.loadProducts();
}


function switchAdminTab(tabName, event) {
    if (!shop) return;
    
    // Удаляем активный класс со всех вкладок
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.admin-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Определяем имя вкладки из события или параметра
    let activeTabName = tabName;
    if (event && event.target) {
        const clickedTab = event.target.closest('.admin-tab');
        if (clickedTab && clickedTab.dataset.tab) {
            activeTabName = clickedTab.dataset.tab;
        }
    }
    
    // Активируем соответствующую вкладку
    const tabButton = document.querySelector(`.admin-tab[data-tab="${activeTabName}"]`);
    if (tabButton) {
        tabButton.classList.add('active');
    }
    
    const tabContent = document.getElementById(activeTabName + '-tab');
    if (tabContent) {
        tabContent.classList.add('active');
        
        // Загружаем данные только если вкладка еще не загружена
        const listContainer = tabContent.querySelector('.admin-list');
        if (listContainer && listContainer.children.length === 0) {
            if (activeTabName === 'users') {
                shop.loadAdminUsers();
            } else if (activeTabName === 'orders') {
                shop.loadAdminOrders();
            }
        }
    }
}

// Инициализация при загрузке страницы
let shop;
document.addEventListener('DOMContentLoaded', () => {
    shop = new NeonShop();

    // Глобальные функции
    window.shop = shop;
    window.completeRegistrationWithPassword = () => shop.completeRegistrationWithPassword();
    window.loadProducts = loadProducts;
    window.checkout = checkout;
    window.logout = logout;
    window.openAuthModal = openAuthModal;
    window.closeAuthModal = closeAuthModal;
    window.openProfileModal = openProfileModal;
    window.closeProfileModal = closeProfileModal;
    window.openCartModal = openCartModal;
    window.closeCartModal = closeCartModal;
    window.openAdminPanel = openAdminPanel;
    window.closeAdminPanel = closeAdminPanel;
    window.showLoginForm = showLoginForm;
    window.showRegisterForm = showRegisterForm;
    window.switchAdminTab = switchAdminTab;
    window.closeEditProductModal = closeEditProductModal;
    window.closeAddProductModal = closeAddProductModal;
    window.addNewProduct = addNewProduct;
    window.saveProfileField = saveProfileField;
    window.cancelEdit = cancelEdit;
    window.deleteAccount = deleteAccount;
    
    // Экспортируем функции регистрации
    if (shop) {
        window.nextRegisterStep = () => shop.nextRegisterStep();
        window.prevRegisterStep = () => shop.prevRegisterStep();
        window.skipFullName = () => shop.skipFullName();
    }
});

function saveProfileField(field) {
    if (!shop) return;
    
    let value;
    if (field === 'password') {
        const password = document.getElementById('edit-password-input').value;
        const confirm = document.getElementById('edit-password-confirm').value;
        
        if (!password || password.length < 6) {
            shop.showToast('Пароль должен быть не менее 6 символов', 'error');
            return;
        }
        
        if (password !== confirm) {
            shop.showToast('Пароли не совпадают', 'error');
            return;
        }
        
        value = password;
    } else {
        const input = document.getElementById(`edit-${field}-input`);
        if (!input) return;
        value = input.value.trim();
        
        if (!value && field !== 'fullname') {
            shop.showToast('Поле не может быть пустым', 'error');
            return;
        }
        
        if (field === 'email') {
            // Смена email обрабатывается отдельной функцией с подтверждением через код
            shop.changeEmail();
            return;
        }
        
        if (field === 'username' && (value.length < 3 || value.length > 50)) {
            shop.showToast('Имя пользователя должно быть от 3 до 50 символов', 'error');
            return;
        }
    }
    
    shop.updateProfile(field, value);
}

function cancelEdit(field) {
    if (field === 'email') {
        // Для email используем специальную функцию отмены
        if (shop) {
            shop.cancelEmailChange();
        }
        // Также скрываем форму ввода email
        const emailForm = document.getElementById('edit-email-form');
        if (emailForm) {
            emailForm.style.display = 'none';
        }
    } else {
        const form = document.getElementById(`edit-${field}-form`);
        if (form) {
            form.style.display = 'none';
            const inputs = form.querySelectorAll('input');
            inputs.forEach(input => input.value = '');
        }
    }
}

function deleteAccount() {
    if (shop) {
        shop.deleteAccount();
    }
}

// Обработчик для офлайн режима
window.addEventListener('offline', () => {
    if (shop) {
        shop.showToast('Отсутствует подключение к интернету', 'error', 5000);
    }
});

window.addEventListener('online', () => {
    if (shop) {
        shop.showToast('Подключение восстановлено', 'success', 3000);
    }
});

// Предотвращение свайпа для навигации назад на iOS
document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) return;

    const startY = e.touches[0].clientY;
    const startX = e.touches[0].clientX;

    const handleTouchMove = (e) => {
        if (e.touches.length > 1) return;

        const deltaY = e.touches[0].clientY - startY;
        const deltaX = e.touches[0].clientX - startX;

        // Если горизонтальный свайп больше вертикального, предотвращаем скролл страницы
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            e.preventDefault();
        }
    };

    const handleTouchEnd = () => {
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
});
