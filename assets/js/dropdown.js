/*
 * dropdown.js — Vanilla JS dropdown controller
 * Replaces Bootstrap's dropdown JS functionality.
 *
 * Toggles .show class on the .dropdown-menu when a [data-toggle="dropdown"]
 * element is clicked. Closes on outside click or Escape key.
 */
(function (global) {
  'use strict';

  var Dropdown = {};

  function getMenu(toggle) {
    var parent = toggle.closest('.btn-group') || toggle.closest('.dropdown');
    if (!parent) return null;
    return parent.querySelector('.dropdown-menu');
  }

  function closeAll() {
    document.querySelectorAll('.dropdown-menu.show').forEach(function (menu) {
      menu.classList.remove('show');
    });
  }

  function onToggleClick(e) {
    e.preventDefault();
    e.stopPropagation();
    var toggle = e.currentTarget;
    var menu = getMenu(toggle);
    if (!menu) return;
    var isOpen = menu.classList.contains('show');
    closeAll();
    if (!isOpen) {
      menu.classList.add('show');
    }
  }

  function onOutsideClick(e) {
    if (!e.target.closest('.dropdown-menu') && !e.target.closest('[data-toggle="dropdown"]')) {
      closeAll();
    }
  }

  function onEscape(e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
      closeAll();
    }
  }

  Dropdown.toggle = function (menuOrToggle) {
    var el = typeof menuOrToggle === 'string' ? document.querySelector(menuOrToggle) : menuOrToggle;
    if (!el) return;
    if (el.classList.contains('dropdown-menu')) {
      closeAll();
      el.classList.add('show');
    } else {
      var menu = getMenu(el);
      if (menu) {
        var isOpen = menu.classList.contains('show');
        closeAll();
        if (!isOpen) menu.classList.add('show');
      }
    }
  };

  Dropdown.close = closeAll;

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-toggle="dropdown"]').forEach(function (toggle) {
      toggle.addEventListener('click', onToggleClick);
    });
    document.addEventListener('click', onOutsideClick);
    document.addEventListener('keydown', onEscape);
  });

  global.Dropdown = Dropdown;
})(window);
