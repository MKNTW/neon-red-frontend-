// products.js - Модуль для работы с товарами
import { escapeHtml, escapeAttr, safeFetch, showLoadingIndicator, hideLoadingIndicator, showToast } from './utils.js';

export class ProductsModule {
    constructor(shop) {
        this.shop = shop;
    }

    renderSkeletonProducts(count = 6) {
        const productsContainer = document.getElementById('products');
        if (!productsContainer) return;
        
        productsContainer.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const skeleton = document.createElement('div');
            skeleton.className = 'skeleton-product';
            skeleton.innerHTML = `
                <div class="skeleton skeleton-image"></div>
                <div class="skeleton-content">
                    <div class="skeleton skeleton-title"></div>
                    <div class="skeleton skeleton-description"></div>
                    <div class="skeleton skeleton-description"></div>
                    <div class="skeleton-footer">
                        <div class="skeleton skeleton-price"></div>
                    </div>
                    <div class="skeleton skeleton-button"></div>
                </div>
            `;
            productsContainer.appendChild(skeleton);
        }
    }

    async loadProducts(page = 1, useCache = true) {
        const productsContainer = document.getElementById('products');
        if (!productsContainer) return;
        
        const PRODUCTS_CACHE_TTL_MS = 5 * 60 * 1000;
        const CACHE_KEY = 'products_cache';
        const CACHE_TIMESTAMP_KEY = 'products_cache_timestamp';
        
        if (useCache && page === 1) {
            try {
                const cached = localStorage.getItem(CACHE_KEY);
                const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
                
                if (cached && timestamp && Date.now() - parseInt(timestamp) < PRODUCTS_CACHE_TTL_MS) {
                    const cachedData = JSON.parse(cached);
                    this.shop.products = cachedData.products || cachedData;
                    this.shop.currentPage = cachedData.page || 1;
                    this.shop.totalPages = cachedData.totalPages || 1;
                    this.renderProducts();
                    return;
                }
            } catch (e) {
                console.warn('Cache read error:', e);
            }
        }
        
        this.renderSkeletonProducts(6);
        showLoadingIndicator();

        try {
            const url = `${this.shop.API_BASE_URL}/products?page=${page}&limit=20`;
            const response = await safeFetch(url, { showLoading: false });

            const data = await response.json();
            
            if (data.products) {
                this.shop.products = data.products;
                this.shop.currentPage = data.page || page;
                this.shop.totalPages = data.totalPages || 1;
                this.shop.totalProducts = data.total || data.products.length;
            } else {
                this.shop.products = data;
                this.shop.currentPage = 1;
                this.shop.totalPages = 1;
                this.shop.totalProducts = data.length;
            }
            
            if (page === 1) {
                try {
                    localStorage.setItem(CACHE_KEY, JSON.stringify({
                        products: this.shop.products,
                        page: this.shop.currentPage,
                        totalPages: this.shop.totalPages,
                        total: this.shop.totalProducts
                    }));
                    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
                } catch (e) {
                    console.warn('Cache write error:', e);
                }
            }
            
            this.renderProducts();
            this.renderPagination();
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
            retryBtn.addEventListener('click', () => this.loadProducts(page, false));
            
            errorDiv.appendChild(errorP);
            errorDiv.appendChild(retryBtn);
            productsContainer.innerHTML = '';
            productsContainer.appendChild(errorDiv);
            showToast(error.message || 'Ошибка загрузки товаров', 'error');
        }
    }
    
    renderPagination() {
        if (!this.shop.totalPages || this.shop.totalPages <= 1) return;
        
        const productsContainer = document.getElementById('products');
        if (!productsContainer) return;
        
        const oldPagination = document.getElementById('products-pagination');
        if (oldPagination) oldPagination.remove();
        
        const pagination = document.createElement('div');
        pagination.id = 'products-pagination';
        pagination.className = 'products-pagination';
        pagination.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 10px; margin: 30px 0; flex-wrap: wrap;';
        
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '← Назад';
        prevBtn.className = 'pagination-btn';
        prevBtn.disabled = this.shop.currentPage === 1;
        prevBtn.addEventListener('click', () => {
            if (this.shop.currentPage > 1) {
                this.loadProducts(this.shop.currentPage - 1, false);
            }
        });
        
        const pageInfo = document.createElement('span');
        pageInfo.textContent = `Страница ${this.shop.currentPage} из ${this.shop.totalPages}`;
        pageInfo.style.cssText = 'color: var(--text-secondary); font-weight: 600;';
        
        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Вперед →';
        nextBtn.className = 'pagination-btn';
        nextBtn.disabled = this.shop.currentPage >= this.shop.totalPages;
        nextBtn.addEventListener('click', () => {
            if (this.shop.currentPage < this.shop.totalPages) {
                this.loadProducts(this.shop.currentPage + 1, false);
            }
        });
        
        pagination.appendChild(prevBtn);
        pagination.appendChild(pageInfo);
        pagination.appendChild(nextBtn);
        
        productsContainer.appendChild(pagination);
    }

    renderProducts() {
        const productsContainer = document.getElementById('products');
        if (!productsContainer) return;
        
        productsContainer.innerHTML = '';
        
        if (!this.shop.user || !this.shop.token) {
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

        if (!this.shop.products || this.shop.products.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-state empty-products';
            emptyDiv.innerHTML = `
                <div class="empty-state-icon">📦</div>
                <h3 class="empty-state-title">Товаров пока нет</h3>
                <p class="empty-state-description">
                    Каталог товаров пуст. Скоро здесь появятся новые товары!
                </p>
            `;
            productsContainer.appendChild(emptyDiv);
            return;
        }

        this.shop.products.forEach((product, index) => {
            const div = document.createElement('div');
            div.className = 'product';
            div.setAttribute('role', 'listitem');
            div.style.animationDelay = `${index * 0.05}s`;

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
            
            if (product.image_url && product.image_url !== 'https://via.placeholder.com/300') {
                const imageUrl = product.image_url.trim();
                if (imageUrl && imageUrl.startsWith('http')) {
                    img.src = imageUrl;
                    img.style.display = 'block';
                    imageFallback.style.display = 'none';
                    
                    img.onerror = function() {
                        this.style.display = 'none';
                        if (imageFallback) imageFallback.style.display = 'flex';
                    };
                    
                    img.onload = function() {
                        this.style.display = 'block';
                        if (imageFallback) imageFallback.style.display = 'none';
                    };
                } else {
                    img.style.display = 'none';
                    imageFallback.style.display = 'flex';
                }
            } else {
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
            addBtn.setAttribute('aria-disabled', product.quantity === 0);
            addBtn.textContent = product.quantity === 0 ? 'Нет в наличии' : 'В корзину';
            if (product.quantity === 0) {
                addBtn.disabled = true;
            }
            addBtn.addEventListener('click', () => this.shop.cartModule.addToCart(product.id));
            addBtn.addEventListener('keydown', (e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !addBtn.disabled) {
                    e.preventDefault();
                    this.shop.cartModule.addToCart(product.id);
                }
            });
            
            productInfo.appendChild(title);
            productInfo.appendChild(description);
            productInfo.appendChild(meta);
            productInfo.appendChild(addBtn);
            
            div.appendChild(productImageContainer);
            div.appendChild(productInfo);

            productsContainer.appendChild(div);
        });
    }
}

