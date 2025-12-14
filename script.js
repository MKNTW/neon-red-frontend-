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
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // Если ответ не OK, пытаемся получить сообщение об ошибке
        if (!response.ok) {
            let errorMessage = `Ошибка ${response.status}`;
            let errorDetails = null;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorData.message || errorMessage;
                errorDetails = errorData.details || errorData;
                // Логируем полную информацию об ошибке для отладки
                console.error(`[safeFetch] Error ${response.status} for ${url}:`, {
                    message: errorMessage,
                    details: errorDetails,
                    fullResponse: errorData
                });
            } catch (e) {
                // Если не удалось распарсить JSON, используем статус
                if (response.status === 401) errorMessage = 'Требуется авторизация';
                else if (response.status === 403) errorMessage = 'Доступ запрещен';
                else if (response.status === 404) errorMessage = `Ресурс не найден: ${url}`;
                else if (response.status === 500) errorMessage = 'Ошибка сервера';
                console.error(`[safeFetch] Error ${response.status} for ${url}:`, errorMessage, e);
            }
            // Добавляем детали к сообщению об ошибке, если они есть
            if (errorDetails && typeof errorDetails === 'string') {
                errorMessage += `: ${errorDetails}`;
            }
            throw new Error(errorMessage);
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

        // Автоматическое определение URL для API
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            this.API_BASE_URL = 'http://localhost:3001/api';
        } else if (window.location.hostname === 'shop.mkntw.xyz' || window.location.hostname.includes('mkntw.xyz')) {
            // Для продакшена используем api-shop.mkntw.xyz
            this.API_BASE_URL = 'https://apiforshop.mkntw.xyz/api';
        } else {
            // Fallback на api-shop.mkntw.xyz
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
    // const res = await fetch('https://shop.mkntw.xyz/api/upload-image', {
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
        const title = document.getElementById('new-product-title').value?.trim();
        const description = document.getElementById('new-product-description').value?.trim() || null;
        const priceValue = document.getElementById('new-product-price').value;
        const quantityValue = document.getElementById('new-product-quantity').value;
        const imageUrl = document.getElementById('new-product-image').value?.trim();
        const fileInput = document.getElementById('new-product-image-upload');
        const file = fileInput.files[0];

        // Валидация
        if (!title || title.length < 1) {
            this.showToast('Название товара обязательно', 'error');
            return;
        }

        const price = parseFloat(priceValue);
        if (isNaN(price) || price < 0) {
            this.showToast('Цена должна быть положительным числом', 'error');
            return;
        }

        const quantity = parseInt(quantityValue);
        if (isNaN(quantity) || quantity < 0 || !Number.isInteger(quantity)) {
            this.showToast('Количество должно быть неотрицательным целым числом', 'error');
            return;
        }

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
            const productData = {
                title,
                description: description || null,
                price,
                quantity,
                image_url: finalImageUrl
            };
            
            console.log('Creating product with data:', productData);
            console.log('Token present:', !!this.token);
            
            const productResponse = await safeFetch(`${this.API_BASE_URL}/admin/products`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(productData)
            });
            
            const productResult = await productResponse.json();
            console.log('Product created successfully:', productResult);
            this.showToast('Товар создан', 'success');

            this.closeAddProductModal();
            await this.loadAdminProducts();
            await this.loadProducts();
        } catch (error) {
            console.error('Error creating product:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack
            });
            this.showToast(error.message || 'Ошибка создания товара', 'error');
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
            const orderData = {
                items: this.cart.map(item => ({
                    id: item.id,
                    quantity: item.quantity,
                    price: item.price
                })),
                shippingAddress: shippingAddress,
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

            this.showToast(`Заказ #${order.id.substring(0, 8)} оформлен!`, 'success', 5000);

            // Очищаем корзину
            this.cart = [];
            this.saveCart();
            this.updateCartInfo();
            this.renderCart();

            // Закрываем модальное окно с анимацией
            setTimeout(() => {
                this.closeAllModals();
            }, 1500);

        } catch (error) {
            this.showToast(error.message, 'error');
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
                        form.dispatchEvent(new Event('submit'));
                    }
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
        } else if (currentStep === 3) {
            const fullName = document.getElementById('register-fullname')?.value.trim();
            this.registerData.fullName = fullName;
        }
        
        this.currentRegisterStep = currentStep + 1;
        this.updateRegisterStepDisplay();
    }
    
    prevRegisterStep() {
        if (this.currentRegisterStep > 1) {
            this.currentRegisterStep--;
            this.updateRegisterStepDisplay();
        }
    }
    
    skipFullName() {
        this.registerData.fullName = '';
        this.currentRegisterStep = 4;
        this.updateRegisterStepDisplay();
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

    async register(username, email, password, fullName) {
        try {
            const response = await safeFetch(`${this.API_BASE_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password, fullName })
            });

            const data = await response.json();

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
            
            const orderId = document.createElement('p');
            const strong = document.createElement('strong');
            strong.textContent = `Заказ #${escapeHtml(order.id.substring(0, 8))}`;
            orderId.appendChild(strong);
            
            const date = document.createElement('p');
            date.innerHTML = `Дата: ${escapeHtml(new Date(order.created_at).toLocaleDateString('ru-RU'))}`;
            
            const amount = document.createElement('p');
            amount.innerHTML = `Сумма: <strong>${escapeHtml(order.total_amount)} ₽</strong>`;
            
            const status = document.createElement('p');
            const statusSpan = document.createElement('span');
            statusSpan.textContent = escapeHtml(order.status);
            statusSpan.style.color = '#00ff88';
            status.innerHTML = 'Статус: ';
            status.appendChild(statusSpan);
            
            orderDiv.appendChild(orderId);
            orderDiv.appendChild(date);
            orderDiv.appendChild(amount);
            orderDiv.appendChild(status);
            
            ordersList.appendChild(orderDiv);
        });
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
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
                shop.showToast('Неверный формат email', 'error');
                return;
            }
        }
        
        if (field === 'username' && (value.length < 3 || value.length > 50)) {
            shop.showToast('Имя пользователя должно быть от 3 до 50 символов', 'error');
            return;
        }
    }
    
    shop.updateProfile(field, value);
}

function cancelEdit(field) {
    const form = document.getElementById(`edit-${field}-form`);
    if (form) {
        form.style.display = 'none';
        const inputs = form.querySelectorAll('input');
        inputs.forEach(input => input.value = '');
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
