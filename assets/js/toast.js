/**
 * Custom Lightweight Toast & Modal Notification System for RISC-V ALE
 * Replaces PNotify and PNotifyConfirm with zero external dependencies.
 */
(function (/** @type {any} */ global) {
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

      // Built with DOM calls rather than innerHTML: titles and bodies routinely
      // carry user-supplied strings (file names, ELF symbols, error text), and
      // none of them may ever be parsed as markup.
      const renderContent = (curTitle, curText, curIcon) => {
        toast.textContent = '';

        const header = document.createElement('div');
        header.className = 'toast-header';

        if (curIcon) {
          const iconEl = document.createElement('i');
          iconEl.className = String(curIcon) + ' toast-icon';
          header.appendChild(iconEl);
        }

        if (curTitle) {
          const titleEl = document.createElement('strong');
          titleEl.className = 'toast-title';
          titleEl.textContent = String(curTitle);
          header.appendChild(titleEl);
        }

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'toast-close';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.textContent = '×';
        header.appendChild(closeBtn);

        toast.appendChild(header);

        if (curText) {
          const bodyEl = document.createElement('div');
          bodyEl.className = 'toast-body';
          // Preserves the line breaks the old <br> substitution produced.
          bodyEl.style.whiteSpace = 'pre-line';
          bodyEl.textContent = String(curText);
          toast.appendChild(bodyEl);
        }
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
        const closeBtn = /** @type {HTMLElement | null} */ (
          toast.querySelector('.toast-close')
        );
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

        const dialog = document.createElement('div');
        dialog.className = 'toast-modal-dialog';

        const titleEl = document.createElement('h5');
        titleEl.className = 'toast-modal-title';
        const iconEl = document.createElement('i');
        iconEl.className = String(icon) + ' text-warning';
        titleEl.appendChild(iconEl);
        titleEl.appendChild(document.createTextNode(' ' + String(title)));
        dialog.appendChild(titleEl);

        const bodyEl = document.createElement('div');
        bodyEl.className = 'toast-modal-body';
        bodyEl.style.whiteSpace = 'pre-line';
        bodyEl.textContent = String(text);
        dialog.appendChild(bodyEl);

        const actions = document.createElement('div');
        actions.className = 'toast-modal-actions';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-sm btn-secondary toast-btn-cancel';
        cancelBtn.textContent = String(cancelText);
        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'btn btn-sm btn-primary toast-btn-confirm';
        confirmBtn.textContent = String(okText);
        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        dialog.appendChild(actions);

        backdrop.appendChild(dialog);

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

        /** @type {HTMLElement} */ (
          backdrop.querySelector('.toast-btn-cancel')
        ).onclick = () => closeModal(false);
        /** @type {HTMLElement} */ (
          backdrop.querySelector('.toast-btn-confirm')
        ).onclick = () => closeModal(true);
      });
    }
  }

  const toastInstance = /** @type {any} */ (new ToastManager());

  // Backward compatibility mock for PNotify.Stack if referenced
  toastInstance.Stack = function () {
    return toastInstance;
  };

  global.Toast = toastInstance;
  global.PNotify = toastInstance; // Backward compatibility alias
})(typeof window !== 'undefined' ? window : globalThis);
