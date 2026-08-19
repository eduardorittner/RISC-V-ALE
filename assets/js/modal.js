/*
 * modal.js — Vanilla JS modal controller
 * Replaces Bootstrap's modal JS functionality.
 *
 * API:
 *   Modal.open(element, options)  — show a modal element
 *   Modal.close(element)          — hide a modal element
 *   Modal.isOpen(element)         — check if a modal is currently shown
 *
 * Supports data-dismiss="modal" attributes on close buttons.
 * Handles Escape key and backdrop click (unless backdrop: false).
 */
(function (global) {
  'use strict';

  var Modal = {};

  // Track open modals and active backdrop
  var openModals = [];
  var backdrop = null;
  var escapeHandler = null;

  function ensureBackdrop() {
    if (backdrop) return backdrop;
    backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop fade';
    document.body.appendChild(backdrop);
    // Force reflow then add show class for transition
    void backdrop.offsetWidth;
    backdrop.classList.add('show');
    return backdrop;
  }

  function removeBackdrop() {
    if (!backdrop) return;
    var bd = backdrop;
    backdrop = null;
    bd.classList.remove('show');
    setTimeout(function () {
      if (bd.parentNode) bd.parentNode.removeChild(bd);
    }, 150);
  }

  function onEscape(e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
      // Close the topmost modal that allows keyboard dismiss
      for (var i = openModals.length - 1; i >= 0; i--) {
        var m = openModals[i];
        if (m._allowKeyboard) {
          Modal.close(m.element);
          break;
        }
      }
    }
  }

  Modal.open = function (element, options) {
    options = options || {};
    var el = typeof element === 'string' ? document.querySelector(element) : element;
    if (!el) return;
    if (Modal.isOpen(el)) return;

    var useBackdrop = options.backdrop !== false;
    var allowKeyboard = options.keyboard !== false && el.getAttribute('data-keyboard') !== 'false';

    el._modalState = { allowKeyboard: allowKeyboard, useBackdrop: useBackdrop };

    // Show the modal
    el.classList.add('show');
    el.style.display = 'block';
    el.setAttribute('aria-modal', 'true');

    if (useBackdrop) {
      ensureBackdrop();
    }

    openModals.push({ element: el, _allowKeyboard: allowKeyboard });

    // Attach Escape handler if not already attached
    if (!escapeHandler) {
      escapeHandler = onEscape;
      document.addEventListener('keydown', escapeHandler);
    }

    // Handle backdrop click to close (only if backdrop is enabled and not static)
    if (useBackdrop && options.backdrop !== 'static' && el.getAttribute('data-backdrop') !== 'static') {
      el.addEventListener('click', backdropClickHandler);
    }

    // Handle data-dismiss buttons within this modal
    var dismissButtons = el.querySelectorAll('[data-dismiss="modal"]');
    dismissButtons.forEach(function (btn) {
      btn.addEventListener('click', dismissHandler);
    });

    // Focus the modal for accessibility
    el.focus();
  };

  function backdropClickHandler(e) {
    // Only close if the click was directly on the modal element (the backdrop area), not its children
    if (e.target === e.currentTarget) {
      Modal.close(e.currentTarget);
    }
  }

  function dismissHandler(e) {
    var modal = e.target.closest('.modal');
    if (modal) Modal.close(modal);
  }

  Modal.close = function (element) {
    var el = typeof element === 'string' ? document.querySelector(element) : element;
    if (!el) return;

    el.classList.remove('show');
    el.style.display = '';
    el.removeAttribute('aria-modal');

    // Remove from openModals
    openModals = openModals.filter(function (m) { return m.element !== el; });

    // Remove event listeners
    el.removeEventListener('click', backdropClickHandler);
    var dismissButtons = el.querySelectorAll('[data-dismiss="modal"]');
    dismissButtons.forEach(function (btn) {
      btn.removeEventListener('click', dismissHandler);
    });

    // Remove backdrop if no more modals are open
    if (openModals.length === 0) {
      removeBackdrop();
      if (escapeHandler) {
        document.removeEventListener('keydown', escapeHandler);
        escapeHandler = null;
      }
    }

    delete el._modalState;
  };

  Modal.isOpen = function (element) {
    var el = typeof element === 'string' ? document.querySelector(element) : element;
    if (!el) return false;
    return el.classList.contains('show');
  };

  // Auto-init: wire up all [data-dismiss="modal"] buttons and [data-toggle="modal"] triggers
  document.addEventListener('DOMContentLoaded', function () {
    // Handle data-toggle="modal" triggers
    document.querySelectorAll('[data-toggle="modal"]').forEach(function (trigger) {
      trigger.addEventListener('click', function (e) {
        e.preventDefault();
        var targetSel = trigger.getAttribute('data-target');
        if (targetSel) {
          Modal.open(targetSel);
        }
      });
    });
  });

  // makeDraggable — tiny custom draggable implementation
  // Replaces jQuery UI's .draggable({ handle: "..." })
  // Usage: Modal.makeDraggable(element, handleSelector)
  Modal.makeDraggable = function (element, handleSelector) {
    var el = typeof element === 'string' ? document.querySelector(element) : element;
    if (!el) return;
    var handle = handleSelector ? el.querySelector(handleSelector) : el;
    if (!handle) return;

    var isDragging = false;
    var startX, startY, initLeft, initTop;

    handle.addEventListener('mousedown', function (e) {
      // Don't drag if clicking on a button or close button
      if (e.target.closest('button') || e.target.closest('.close')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      // Get current position
      var rect = el.getBoundingClientRect();
      var dialog = el.querySelector('.modal-dialog') || el;
      var dialogRect = dialog.getBoundingClientRect();
      initLeft = dialogRect.left;
      initTop = dialogRect.top;

      // Make the dialog absolutely positioned
      dialog.style.position = 'fixed';
      dialog.style.left = initLeft + 'px';
      dialog.style.top = initTop + 'px';
      dialog.style.margin = '0';
      dialog.style.transform = 'none';

      e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      var dialog = el.querySelector('.modal-dialog') || el;
      dialog.style.left = (initLeft + dx) + 'px';
      dialog.style.top = (initTop + dy) + 'px';
    });

    document.addEventListener('mouseup', function () {
      isDragging = false;
    });
  };

  global.Modal = Modal;
})(window);

