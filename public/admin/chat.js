const AGENT_SERVICE_URL = 'http://localhost:3001';
const chatSessionId = (crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now()}-${Math.random()}`);

function appendChatMessage(role, text) {
  const messagesEl = document.getElementById('chat-messages');
  const bubble = document.createElement('div');
  bubble.className = `chat-message chat-message-${role}`;
  bubble.textContent = text;
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

function setChatError(message) {
  const errorEl = document.getElementById('chat-error');
  if (message) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  } else {
    errorEl.style.display = 'none';
  }
}

async function sendChatMessage(message) {
  const input = document.getElementById('chat-input');
  const submitButton = document.querySelector('#chat-form button[type="submit"]');

  appendChatMessage('user', message);
  setChatError(null);
  input.value = '';
  input.disabled = true;
  submitButton.disabled = true;

  const pendingBubble = appendChatMessage('pending', 'Thinking...');

  try {
    const response = await fetch(`${AGENT_SERVICE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: chatSessionId, message }),
    });

    const result = await response.json();
    pendingBubble.remove();

    if (!response.ok) {
      throw new Error(result.error?.message || 'The assistant service returned an error.');
    }

    appendChatMessage('assistant', result.reply);

    // Refresh the dashboard lists in case the assistant changed an order or product.
    if (typeof loadRecentOrders === 'function') loadRecentOrders();
    if (typeof loadProducts === 'function') loadProducts(document.getElementById('product-search').value);
  } catch (err) {
    pendingBubble.remove();
    console.error('Chat error:', err);
    setChatError(
      `Could not reach the assistant: ${err.message}. Make sure the agent service is running on ${AGENT_SERVICE_URL}.`
    );
  } finally {
    input.disabled = false;
    submitButton.disabled = false;
    input.focus();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const toggleButton = document.getElementById('chat-toggle');
  const panel = document.getElementById('chat-panel');
  const closeButton = document.getElementById('chat-close');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');

  toggleButton.addEventListener('click', () => {
    panel.style.display = 'flex';
    toggleButton.style.display = 'none';
    input.focus();
  });

  closeButton.addEventListener('click', () => {
    panel.style.display = 'none';
    toggleButton.style.display = 'block';
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (message) sendChatMessage(message);
  });
});
