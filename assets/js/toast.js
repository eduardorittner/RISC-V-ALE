/**
 * Custom Lightweight Toast & Modal Notification System for RISC-V ALE
 * Replaces PNotify and PNotifyConfirm with zero external dependencies.
 */
(function (global) {
  'use strict';

  class ToastManager {
    constructor() {
      this.container = null;
      this.maxOpen = 5;
    }

    _ensureContainer() {
      if (!this.container || !document.body.contains(this.container)) {
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.className = 'toast-container-bottom-right';
        document.body.appendChild(this.container);
      }
    }

    show(options = {}) {
      this._ensureContainer();

      // Cap visible toasts to maxOpen to prevent memory leaks
      while (this.container.children.length >= this.maxOpen) {
        this.container.firstChild.remove();
      }

      const type = options.type || 'info';
      const delay = options.delay !== undefined ? options.delay : 5000;
      const title = options.title || '';
      const text = options.text || '';
      const icon = options.icon || this._getDefaultIcon(type);

      const toast = document.createElement('div');
      toast.className = `toast-item toast-${type} animate-toast-slide-in`;

      const renderContent = (curTitle, curText, curIcon) => {
        const iconHtml = curIcon ? `<i class="${curIcon} toast-icon"></i>` : '';
        const titleHtml = curTitle ? `<strong class="toast-title">${curTitle}</strong>` : '';
        const textHtml = curText ? `<div class="toast-body">${String(curText).replace(/\n/g, '<br>')}</div>` : '';

        toast.innerHTML = `
          <div class="toast-header">
            ${iconHtml}
            ${titleHtml}
            <button type="button" class="toast-close" aria-label="Close">&times;</button>
          </div>
          ${textHtml}
        `;
      };

      renderContent(title, text, icon);

      let timer = null;
      const dismiss = () => {
        if (timer) clearTimeout(timer);
        toast.classList.remove('animate-toast-slide-in');
        toast.classList.add('animate-toast-fade-out');
        setTimeout(() => {
          if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
          }
        }, 200);
      };

      const update = (newOpts = {}) => {
        const updatedTitle = newOpts.title !== undefined ? newOpts.title : title;
        const updatedText = newOpts.text !== undefined ? newOpts.text : text;
        const updatedIcon = newOpts.icon !== undefined ? newOpts.icon : icon;
        renderContent(updatedTitle, updatedText, updatedIcon);
        bindClose();
      };

      const bindClose = () => {
        const closeBtn = toast.querySelector('.toast-close');
        if (closeBtn) {
          closeBtn.onclick = (e) => {
            e.stopPropagation();
            dismiss();
          };
        }
      };

      bindClose();

      if (typeof options.onClick === 'function') {
        toast.style.cursor = 'pointer';
        toast.onclick = (e) => {
          options.onClick(e, { update, dismiss, elem: toast });
        };
      }

      this.container.appendChild(toast);

      if (delay !== Infinity && delay > 0) {
        timer = setTimeout(dismiss, delay);
      }

      // Return notification controller object compatible with PNotify usage pattern
      const controller = {
        elem: toast,
        refs: { elem: toast },
        update,
        close: dismiss,
        dismiss,
        on: (eventName, handler) => {
          if (eventName === 'click') {
            toast.style.cursor = 'pointer';
            toast.onclick = (e) => handler(e, { update, dismiss });
          }
        }
      };

      return controller;
    }

    _getDefaultIcon(type) {
      switch (type) {
        case 'success': return 'fas fa-check-circle';
        case 'error': return 'fas fa-exclamation-circle';
        case 'warning':
        case 'notice': return 'fas fa-exclamation-triangle';
        default: return 'fas fa-info-circle';
      }
    }

    info(opts) {
      return this.show(typeof opts === 'string' ? { text: opts, type: 'info' } : { ...opts, type: 'info' });
    }

    success(opts) {
      return this.show(typeof opts === 'string' ? { text: opts, type: 'success' } : { ...opts, type: 'success' });
    }

    error(opts) {
      return this.show(typeof opts === 'string' ? { text: opts, type: 'error' } : { ...opts, type: 'error' });
    }

    notice(opts) {
      return this.show(typeof opts === 'string' ? { text: opts, type: 'notice' } : { ...opts, type: 'notice' });
    }

    confirm(options = {}) {
      return new Promise((resolve) => {
        const title = options.title || 'Confirmation';
        const text = options.text || '';
        const okText = options.okText || 'Proceed';
        const cancelText = options.cancelText || 'Cancel';
        const icon = options.icon || 'fas fa-exclamation-triangle';

        const backdrop = document.createElement('div');
        backdrop.className = 'toast-modal-backdrop';
        backdrop.innerHTML = `
          <div class="toast-modal-dialog">
            <h5 class="toast-modal-title">
              <i class="${icon} text-warning"></i>
              ${title}
            </h5>
            <div class="toast-modal-body">${String(text).replace(/\n/g, '<br>')}</div>
            <div class="toast-modal-actions">
              <button type="button" class="btn btn-sm btn-secondary toast-btn-cancel">${cancelText}</button>
              <button type="button" class="btn btn-sm btn-primary toast-btn-confirm">${okText}</button>
            </div>
          </div>
        `;

        document.body.appendChild(backdrop);

        const closeModal = (result) => {
          backdrop.classList.add('animate-toast-fade-out');
          setTimeout(() => {
            if (backdrop.parentNode) {
              backdrop.parentNode.removeChild(backdrop);
            }
            resolve(result);
          }, 150);
        };

        backdrop.querySelector('.toast-btn-cancel').onclick = () => closeModal(false);
        backdrop.querySelector('.toast-btn-confirm').onclick = () => closeModal(true);
      });
    }
  }

  const toastInstance = new ToastManager();

  // Backward compatibility mock for PNotify.Stack if referenced
  toastInstance.Stack = function () {
    return toastInstance;
  };

  global.Toast = toastInstance;
  global.PNotify = toastInstance; // Backward compatibility alias
})(typeof window !== 'undefined' ? window : this);
