async function loadProducts() {
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error');
  const productsGridEl = document.getElementById('products-grid');
  const emptyEl = document.getElementById('empty');
  const statsEl = document.getElementById('stats');
  
  try {
    const response = await fetch('/api/products?status=active&limit=100');
    const result = await response.json();
    
    if (!result.success || !result.data) {
      throw new Error(result.error?.message || 'Failed to load products');
    }
    
    const products = result.data.data || result.data || [];
    
    if (products.length === 0) {
      loadingEl.style.display = 'none';
      emptyEl.style.display = 'block';
      return;
    }
    
    // Update stats
    const activeProducts = products.filter(p => p.status === 'active');
    document.getElementById('total-products').textContent = products.length;
    document.getElementById('active-products').textContent = activeProducts.length;
    statsEl.style.display = 'flex';
    
    // Render products
    productsGridEl.innerHTML = products.map(product => {
      const defaultVariant = product.variants.find(v => v.isDefault) || product.variants[0];
      const primaryImage = product.images.find(img => img.isPrimary) || product.images[0];
      const minPrice = Math.min(...product.variants.map(v => v.price));
      const maxPrice = Math.max(...product.variants.map(v => v.price));
      const hasPriceRange = minPrice !== maxPrice;
      const hasComparePrice = defaultVariant?.compareAtPrice && defaultVariant.compareAtPrice > defaultVariant.price;
      
      return `
        <div class="product-card">
          <div class="product-image">
            ${primaryImage 
              ? `<img src="${primaryImage.url}" alt="${primaryImage.altText || product.name}" onerror="this.parentElement.innerHTML='<span>No Image</span>'">`
              : '<span>No Image</span>'
            }
          </div>
          <div class="product-info">
            <div class="product-name">${escapeHtml(product.name)}</div>
            <div class="product-description">${escapeHtml(product.description || product.shortDescription || '')}</div>
            <div class="product-price">
              <span class="price-current">
                $${hasPriceRange ? minPrice.toFixed(2) + ' - $' + maxPrice.toFixed(2) : defaultVariant.price.toFixed(2)}
              </span>
              ${hasComparePrice ? `<span class="price-compare">$${defaultVariant.compareAtPrice.toFixed(2)}</span>` : ''}
            </div>
            ${product.variants.length > 1 ? `<div class="product-variants">${product.variants.length} variants available</div>` : ''}
            ${product.tags && product.tags.length > 0 ? `
              <div class="product-tags">
                ${product.tags.slice(0, 3).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
    
    loadingEl.style.display = 'none';
    productsGridEl.style.display = 'grid';
  } catch (err) {
    console.error('Error loading products:', err);
    loadingEl.style.display = 'none';
    errorEl.textContent = 'Failed to load products: ' + err.message;
    errorEl.style.display = 'block';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Load products on page load
loadProducts();
