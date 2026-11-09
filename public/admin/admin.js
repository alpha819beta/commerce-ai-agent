let currentEditingProduct = null;

// Load recent orders
async function loadRecentOrders() {
  const loadingEl = document.getElementById('orders-loading');
  const errorEl = document.getElementById('orders-error');
  const listEl = document.getElementById('orders-list');
  
  try {
    const response = await fetch('/api/orders?limit=10&sortBy=createdAt&sortOrder=desc');
    const result = await response.json();
    
    if (!result.success || !result.data) {
      throw new Error(result.error?.message || 'Failed to load orders');
    }
    
    const orders = result.data.data || result.data || [];
    
    if (orders.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; color: #666; padding: 2rem;">No orders found</p>';
      loadingEl.style.display = 'none';
      return;
    }
    
    listEl.innerHTML = orders.map(order => {
      const statusClass = order.status.replace(/_/g, '-');
      const date = new Date(order.createdAt).toLocaleDateString();
      const time = new Date(order.createdAt).toLocaleTimeString();
      
      const validStatuses = [
        'pending', 'confirmed', 'processing', 'on_hold', 'shipped', 
        'partially_shipped', 'delivered', 'completed', 'cancelled', 
        'refunded', 'partially_refunded'
      ];
      
      const statusOptions = validStatuses.map(status => 
        `<option value="${status}" ${status === order.status ? 'selected' : ''}>${status}</option>`
      ).join('');
      
      return `
        <div class="order-card">
          <div class="order-header">
            <span class="order-number">${escapeHtml(order.orderNumber)}</span>
            <select class="order-status ${statusClass}" data-order-id="${order.id}" onchange="updateOrderStatus('${order.id}', this.value)">
              ${statusOptions}
            </select>
          </div>
          <div class="order-info">
            <div>
              <strong>Customer:</strong> ${escapeHtml(order.customerEmail)}<br>
              <strong>Date:</strong> ${date} ${time}
            </div>
            <div>
              <strong>Items:</strong> ${order.lineItems.length} item(s)<br>
              <strong>Total:</strong> <span class="order-total">$${order.grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    loadingEl.style.display = 'none';
  } catch (err) {
    console.error('Error loading orders:', err);
    loadingEl.style.display = 'none';
    errorEl.textContent = 'Failed to load orders: ' + err.message;
    errorEl.style.display = 'block';
  }
}

// Load products
async function loadProducts(searchTerm = '') {
  const loadingEl = document.getElementById('products-loading');
  const errorEl = document.getElementById('products-error');
  const listEl = document.getElementById('products-list');
  
  try {
    let url = '/api/products?limit=50&sortBy=name&sortOrder=asc';
    if (searchTerm) {
      url += `&search=${encodeURIComponent(searchTerm)}`;
    }
    
    const response = await fetch(url);
    const result = await response.json();
    
    if (!result.success || !result.data) {
      throw new Error(result.error?.message || 'Failed to load products');
    }
    
    const products = result.data.data || result.data || [];
    
    if (products.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; color: #666; padding: 2rem;">No products found</p>';
      loadingEl.style.display = 'none';
      return;
    }
    
    listEl.innerHTML = products.map(product => {
      const defaultVariant = product.variants.find(v => v.isDefault) || product.variants[0];
      const price = defaultVariant ? defaultVariant.price : 0;
      
      return `
        <div class="product-item">
          <div class="product-info">
            <div class="product-name">${escapeHtml(product.name)}</div>
            <div class="product-details">
              Status: ${escapeHtml(product.status)} | 
              Price: $${price.toFixed(2)} | 
              Variants: ${product.variants.length}
            </div>
          </div>
          <div class="product-actions">
            <button class="btn btn-edit" onclick="editProduct('${product.id}')">Edit</button>
          </div>
        </div>
      `;
    }).join('');
    
    loadingEl.style.display = 'none';
  } catch (err) {
    console.error('Error loading products:', err);
    loadingEl.style.display = 'none';
    errorEl.textContent = 'Failed to load products: ' + err.message;
    errorEl.style.display = 'block';
  }
}

// Edit product
async function editProduct(productId) {
  try {
    const response = await fetch(`/api/products/${productId}`);
    const result = await response.json();
    
    if (!result.success || !result.data) {
      throw new Error(result.error?.message || 'Failed to load product');
    }
    
    const product = result.data;
    currentEditingProduct = product;
    
    // Populate form
    document.getElementById('edit-name').value = product.name || '';
    document.getElementById('edit-description').value = product.description || '';
    document.getElementById('edit-short-description').value = product.shortDescription || '';
    document.getElementById('edit-status').value = product.status || 'draft';
    document.getElementById('edit-vendor').value = product.vendor || '';
    document.getElementById('edit-brand').value = product.brand || '';
    document.getElementById('edit-tags').value = product.tags ? product.tags.join(', ') : '';
    
    const defaultVariant = product.variants.find(v => v.isDefault) || product.variants[0];
    if (defaultVariant) {
      document.getElementById('edit-price').value = defaultVariant.price || 0;
    }
    
    // Show modal
    document.getElementById('edit-modal').style.display = 'flex';
  } catch (err) {
    console.error('Error loading product:', err);
    alert('Failed to load product: ' + err.message);
  }
}

// Save product changes
async function saveProduct(event) {
  event.preventDefault();
  
  if (!currentEditingProduct) return;
  
  const formData = {
    name: document.getElementById('edit-name').value,
    description: document.getElementById('edit-description').value,
    shortDescription: document.getElementById('edit-short-description').value,
    status: document.getElementById('edit-status').value,
    vendor: document.getElementById('edit-vendor').value,
    brand: document.getElementById('edit-brand').value,
    tags: document.getElementById('edit-tags').value.split(',').map(t => t.trim()).filter(t => t),
  };
  
  try {
    // Update product info
    const response = await fetch(`/api/products/${currentEditingProduct.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
    });
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to update product');
    }
    
    // Update default variant price if provided
    const price = parseFloat(document.getElementById('edit-price').value);
    if (!isNaN(price) && currentEditingProduct.variants.length > 0) {
      const defaultVariant = currentEditingProduct.variants.find(v => v.isDefault) || currentEditingProduct.variants[0];
      if (defaultVariant && defaultVariant.price !== price) {
        // Update the variant price
        const variantResponse = await fetch(`/api/products/${currentEditingProduct.id}/variants/${defaultVariant.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ price: price }),
        });
        
        const variantResult = await variantResponse.json();
        
        if (!variantResult.success) {
          throw new Error(variantResult.error?.message || 'Failed to update variant price');
        }
      }
    }
    
    // Close modal and refresh products
    document.getElementById('edit-modal').style.display = 'none';
    loadProducts(document.getElementById('product-search').value);
    alert('Product updated successfully!');
  } catch (err) {
    console.error('Error updating product:', err);
    alert('Failed to update product: ' + err.message);
  }
}

// Close modal
function closeModal() {
  document.getElementById('edit-modal').style.display = 'none';
  currentEditingProduct = null;
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Load initial data
  loadRecentOrders();
  loadProducts();
  
  // Search products
  document.getElementById('product-search').addEventListener('input', (e) => {
    loadProducts(e.target.value);
  });
  
  // Refresh products
  document.getElementById('refresh-products').addEventListener('click', () => {
    loadProducts(document.getElementById('product-search').value);
  });
  
  // Modal handlers
  document.getElementById('close-modal').addEventListener('click', closeModal);
  document.getElementById('cancel-edit').addEventListener('click', closeModal);
  document.getElementById('edit-product-form').addEventListener('submit', saveProduct);
  
  // Close modal on outside click
  document.getElementById('edit-modal').addEventListener('click', (e) => {
    if (e.target.id === 'edit-modal') {
      closeModal();
    }
  });
});

// Update order status
async function updateOrderStatus(orderId, newStatus) {
  try {
    const response = await fetch(`/api/orders/${orderId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: newStatus }),
    });
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to update order status');
    }
    
    // Reload orders to show updated status
    loadRecentOrders();
  } catch (err) {
    console.error('Error updating order status:', err);
    alert('Failed to update order status: ' + err.message);
    // Reload to revert the UI change
    loadRecentOrders();
  }
}

// Make functions available globally
window.editProduct = editProduct;
window.updateOrderStatus = updateOrderStatus;
