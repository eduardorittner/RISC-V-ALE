/*
 * data_table.js — Lightweight vanilla JS table component
 * Replaces Bootstrap Table functionality.
 *
 * Features:
 *   - Fetch JSON from a URL (expects { rows: [...] } or plain array)
 *   - Render rows into <tbody>
 *   - Pagination (page size, page list, prev/next)
 *   - Search filter
 *   - Custom cell formatters (via callback or data-formatter attribute)
 *   - Toolbar integration
 *
 * Usage:
 *   var table = new DataTable('#table_devices', {
 *     url: './data/devices.json',
 *     pagination: true,
 *     search: true,
 *     pageSize: 5,
 *     pageList: [5, 10, 25, 50, 100, 'all'],
 *     toolbar: '#table_devices_toolbar',
 *     columns: [
 *       { field: 'name', sortable: true, title: 'Name' },
 *       { field: 'action', formatter: window.device_action_formatter }
 *     ]
 *   });
 *
 *   table.insertRow({ index: 0, row: { ... } });
 *   table.getData();
 */
(function (global) {
  'use strict';

  function DataTable(tableSelector, options) {
    options = options || {};

    this.table = typeof tableSelector === 'string' ? document.querySelector(tableSelector) : tableSelector;
    if (!this.table) {
      console.error('DataTable: table element not found:', tableSelector);
      return;
    }

    this.options = options;
    this.url = options.url || this.table.getAttribute('data-url');
    this.pageSize = options.pageSize || parseInt(this.table.getAttribute('data-page-size'), 10) || 10;
    this.pageList = options.pageList || this._parsePageList();
    this.pagination = options.pagination !== false && (options.pagination || this.table.getAttribute('data-pagination') === 'true');
    this.search = options.search !== false && (options.search || this.table.getAttribute('data-search') === 'true');
    this.toolbar = options.toolbar || this.table.getAttribute('data-toolbar');
    this.showRefresh = options.showRefresh || this.table.getAttribute('data-show-refresh') === 'true';

    this.currentPage = 1;
    this.allData = [];
    this.filteredData = [];
    this.searchTerm = '';

    // Parse columns from <th> elements or options
    this.columns = options.columns || this._parseColumnsFromHeader();

    this._init();
  }

  DataTable.prototype._parsePageList = function () {
    var raw = this.table.getAttribute('data-page-list');
    if (!raw) return [5, 10, 25, 50, 100, 'all'];
    try {
      return JSON.parse(raw);
    } catch (e) {
      return [5, 10, 25, 50, 100, 'all'];
    }
  };

  DataTable.prototype._parseColumnsFromHeader = function () {
    var cols = [];
    var ths = this.table.querySelectorAll('thead th');
    ths.forEach(function (th) {
      var field = th.getAttribute('data-field');
      var sortable = th.getAttribute('data-sortable') === 'true';
      var formatterAttr = th.getAttribute('data-formatter');
      var formatter = null;
      if (formatterAttr) {
        // Resolve formatter from global scope (e.g., "window.device_action_formatter")
        formatter = eval(formatterAttr);
      }
      cols.push({
        field: field,
        sortable: sortable,
        title: th.textContent.trim(),
        formatter: formatter
      });
    });
    return cols;
  };

  DataTable.prototype._init = function () {
    // Ensure tbody exists
    var tbody = this.table.querySelector('tbody');
    if (!tbody) {
      tbody = document.createElement('tbody');
      this.table.appendChild(tbody);
    }
    this.tbody = tbody;

    // Build toolbar (search + pagination controls)
    this._buildToolbar();

    // Load data from URL if provided
    if (this.url) {
      this.load();
    }
  };

  DataTable.prototype._buildToolbar = function () {
    // Create a toolbar container above the table if we need search/pagination
    if (!this.search && !this.pagination) return;

    var wrapper = this.table.closest('.table-responsive') || this.table.parentElement;
    var toolbarDiv = document.createElement('div');
    toolbarDiv.className = 'dt-toolbar';
    toolbarDiv.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 8px 0; flex-wrap: wrap; gap: 8px;';

    // Search box
    if (this.search) {
      var searchDiv = document.createElement('div');
      searchDiv.className = 'dt-search';
      var searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.className = 'form-control form-control-sm';
      searchInput.placeholder = 'Search...';
      searchInput.style.cssText = 'width: 200px; display: inline-block;';
      var self = this;
      searchInput.addEventListener('input', function () {
        self.searchTerm = this.value.toLowerCase();
        self.currentPage = 1;
        self._filter();
        self._render();
      });
      searchDiv.appendChild(searchInput);
      toolbarDiv.appendChild(searchDiv);
    }

    // Refresh button
    if (this.showRefresh) {
      var refreshBtn = document.createElement('button');
      refreshBtn.className = 'btn btn-sm btn-outline-secondary';
      refreshBtn.innerHTML = '<i class="material-icons" style="font-size:16px;">refresh</i>';
      refreshBtn.title = 'Refresh';
      var selfR = this;
      refreshBtn.addEventListener('click', function () {
        selfR.load();
      });
      toolbarDiv.appendChild(refreshBtn);
    }

    // Pagination controls
    if (this.pagination) {
      var pagerDiv = document.createElement('div');
      pagerDiv.className = 'dt-pagination';
      pagerDiv.style.cssText = 'display: flex; align-items: center; gap: 8px;';
      this.pagerDiv = pagerDiv;
      toolbarDiv.appendChild(pagerDiv);
    }

    // Insert toolbar before the table (or before the table-responsive wrapper)
    if (wrapper && wrapper.parentElement) {
      wrapper.parentElement.insertBefore(toolbarDiv, wrapper);
    } else {
      this.table.parentElement.insertBefore(toolbarDiv, this.table);
    }
  };

  DataTable.prototype.load = function () {
    var self = this;
    fetch(this.url).then(function (response) {
      return response.json();
    }).then(function (data) {
      var rows = data.rows || data;
      self.allData = rows;
      self._filter();
      self._render();
    }).catch(function (err) {
      console.error('DataTable: failed to load data from', self.url, err);
    });
  };

  DataTable.prototype._filter = function () {
    if (!this.searchTerm) {
      this.filteredData = this.allData.slice();
    } else {
      this.filteredData = this.allData.filter(function (row) {
        return Object.values(row).some(function (val) {
          if (typeof val === 'object' && val !== null) {
            return JSON.stringify(val).toLowerCase().indexOf(this.searchTerm) !== -1;
          }
          return String(val).toLowerCase().indexOf(this.searchTerm) !== -1;
        }, this);
      }, this);
    }
  };

  DataTable.prototype._getCurrentPageData = function () {
    if (!this.pagination) return this.filteredData;
    var size = this.pageSize === 'all' ? this.filteredData.length : this.pageSize;
    var start = (this.currentPage - 1) * size;
    return this.filteredData.slice(start, start + size);
  };

  DataTable.prototype._render = function () {
    var self = this;
    var pageData = this._getCurrentPageData();

    // Build rows
    var html = '';
    pageData.forEach(function (row) {
      html += '<tr>';
      self.columns.forEach(function (col) {
        var cellValue = row[col.field];
        var displayValue = cellValue;
        if (col.formatter) {
          displayValue = col.formatter(cellValue, row);
        } else if (cellValue !== undefined && cellValue !== null) {
          displayValue = String(cellValue);
        } else {
          displayValue = '';
        }
        html += '<td>' + displayValue + '</td>';
      });
      html += '</tr>';
    });

    this.tbody.innerHTML = html;

    // Render pagination
    if (this.pagination) {
      this._renderPagination();
    }
  };

  DataTable.prototype._renderPagination = function () {
    if (!this.pagerDiv) return;
    var self = this;
    var total = this.filteredData.length;
    var size = this.pageSize === 'all' ? total : this.pageSize;
    var totalPages = Math.max(1, Math.ceil(total / size));

    // Ensure current page is valid
    if (this.currentPage > totalPages) this.currentPage = totalPages;
    if (this.currentPage < 1) this.currentPage = 1;

    var html = '';

    // Page size selector
    html += '<select class="form-control form-control-sm dt-page-size" style="width: auto; display: inline-block;">';
    this.pageList.forEach(function (opt) {
      var val = opt === 'all' ? 'all' : opt;
      var label = opt === 'all' ? 'All' : opt;
      var selected = String(self.pageSize) === String(val) ? ' selected' : '';
      html += '<option value="' + val + '"' + selected + '>' + label + '</option>';
    });
    html += '</select>';

    // Info text
    var start = (this.currentPage - 1) * size + 1;
    var end = Math.min(this.currentPage * size, total);
    html += '<span class="text-muted small" style="white-space: nowrap;">' + start + '-' + end + ' of ' + total + '</span>';

    // Prev/Next buttons
    var prevDisabled = this.currentPage <= 1 ? ' disabled' : '';
    var nextDisabled = this.currentPage >= totalPages ? ' disabled' : '';
    html += '<button class="btn btn-sm btn-outline-secondary dt-prev"' + prevDisabled + '>&laquo;</button>';
    html += '<span class="small" style="white-space: nowrap;">Page ' + this.currentPage + ' / ' + totalPages + '</span>';
    html += '<button class="btn btn-sm btn-outline-secondary dt-next"' + nextDisabled + '>&raquo;</button>';

    this.pagerDiv.innerHTML = html;

    // Wire up events
    var sizeSelect = this.pagerDiv.querySelector('.dt-page-size');
    if (sizeSelect) {
      sizeSelect.addEventListener('change', function () {
        var val = this.value;
        self.pageSize = val === 'all' ? 'all' : parseInt(val, 10);
        self.currentPage = 1;
        self._render();
      });
    }

    var prevBtn = this.pagerDiv.querySelector('.dt-prev');
    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        if (self.currentPage > 1) {
          self.currentPage--;
          self._render();
        }
      });
    }

    var nextBtn = this.pagerDiv.querySelector('.dt-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        if (self.currentPage < totalPages) {
          self.currentPage++;
          self._render();
        }
      });
    }
  };

  // Public API: insert a row at a given index
  DataTable.prototype.insertRow = function (params) {
    var index = params.index !== undefined ? params.index : 0;
    var row = params.row;
    this.allData.splice(index, 0, row);
    this._filter();
    this._render();
  };

  // Public API: get all data
  DataTable.prototype.getData = function () {
    return this.allData;
  };

  // Public API: refresh/reload
  DataTable.prototype.refresh = function () {
    if (this.url) {
      this.load();
    } else {
      this._filter();
      this._render();
    }
  };

  // jQuery-like compatibility: allow calling methods by name
  // e.g., $('#table').bootstrapTable('insertRow', {...})
  // This is handled in interface_elements.js via the DataTable instance directly.

  global.DataTable = DataTable;
})(window);
