/*
 * tabs.js — Vanilla JS tab controller
 * Replaces Bootstrap's tab JS functionality.
 *
 * On [data-toggle="tab"] click: hides all .tab-pane, shows the target pane,
 * and sets the active class on the clicked nav-link.
 */
(function (global) {
  'use strict';

  var Tabs = {};

  function onTabClick(e) {
    e.preventDefault();
    var trigger = e.currentTarget;
    var targetSel = trigger.getAttribute('href');
    if (!targetSel) return;

    // Find the closest tab content container
    var tabContent = trigger.closest('.tab-content');
    if (!tabContent) {
      // Try to find tab-content as a sibling/parent descendant
      var parent = trigger.closest('.card-body') || trigger.closest('.modal-body') || trigger.parentElement;
      tabContent = parent ? parent.querySelector('.tab-content') : null;
    }
    if (!tabContent) return;

    // Hide all panes
    tabContent.querySelectorAll('.tab-pane').forEach(function (pane) {
      pane.classList.remove('show', 'active');
    });

    // Show target pane
    var targetPane = tabContent.querySelector(targetSel);
    if (targetPane) {
      targetPane.classList.add('show', 'active');
    }

    // Deactivate all nav-links in the same nav
    var nav = trigger.closest('.nav-tabs') || trigger.closest('.nav');
    if (nav) {
      nav.querySelectorAll('.nav-link').forEach(function (link) {
        link.classList.remove('active');
      });
    }

    // Activate clicked link
    trigger.classList.add('active');
  }

  Tabs.show = function (triggerOrPane) {
    var el = typeof triggerOrPane === 'string' ? document.querySelector(triggerOrPane) : triggerOrPane;
    if (!el) return;
    if (el.classList.contains('nav-link')) {
      el.click();
    } else if (el.classList.contains('tab-pane')) {
      var trigger = /** @type {HTMLElement | null} */ (
        document.querySelector('[href="#' + el.id + '"]')
      );
      if (trigger) trigger.click();
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-toggle="tab"]').forEach(function (trigger) {
      trigger.addEventListener('click', onTabClick);
    });
  });

  global.Tabs = Tabs;
})(window);
