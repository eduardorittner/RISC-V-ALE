/*jshint esversion: 9*/

// Notification stacks (backward compatibility alias)
window.stackBottomRight = window.Toast;
window.stackBarTop = window.Toast;


// register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service_worker.js').then(function(reg) {
      console.log('Successfully registered service worker', reg);
      reg.addEventListener("updatefound", function () {
        let newWorker = reg.installing;
        newWorker.addEventListener("statechange", function () {
          if(newWorker.state == "installed" && navigator.serviceWorker.controller){
            const update_notice = Toast.info({
              title: 'Update received',
              text: 'A new version of RISC-V ALE is available. Click to update.',
              delay: Infinity,
              onClick: (e, { update }) => {
                newWorker.postMessage({ action: 'skipWaiting' });
                update({
                  text: 'Please Wait',
                  icon: 'fas fa-spinner fa-pulse'
                });
              }
            });
          }
        })
      })
  }).catch(function(err) {
    Toast.error({
      title: 'Service Worker',
      text: 'Error while registering service worker ' + err,
      delay: Infinity
    });
  });

  let refreshing;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (refreshing) return;
    window.location.reload();
    refreshing = true;
  });
}else{
  Toast.error({
    title: 'Service Worker',
    text: 'Failed to register Service Worker.'
  });
}

// check for errors
// Bridge uncaught page errors and rejected promises to a visible notification,
// so a failure is never silent.
window.addEventListener('error', function (event) {
  const detail = (event.error && (event.error.stack || event.error.message)) ||
    event.message || 'Unknown error';
  console.error('Uncaught error:', detail);
  Toast.error({
    title: 'Unexpected Error',
    text: String(detail),
    delay: Infinity
  });
});

window.addEventListener('unhandledrejection', function (event) {
  const reason = event.reason;
  const detail = (reason && (reason.stack || reason.message)) || String(reason);
  console.error('Unhandled promise rejection:', detail);
  Toast.error({
    title: 'Unexpected Error',
    text: String(detail),
    delay: Infinity
  });
});

// load modules
import {MMIO_Manager} from "../../modules/mmio_manager.js";
import {WebTerminal} from "../../modules/terminal.js";
import {Assistant} from "../../modules/assistant.js";
import {simulator_controller} from "../../modules/simulator.js";
import {compiler} from "../../modules/compiler.js";
import {conn} from "../../modules/connection.js";

// Expose on window for performance testing harness (CDP Runtime.evaluate)
window.simulator_controller = simulator_controller;
window.compiler = compiler;
window.run_simulator = run_simulator;
window.__ale_perf_ready__ = true;

var mmio_manager = new MMIO_Manager();
var web_terminal = new WebTerminal(document.getElementById('xterm-container'), document.getElementById("terminal_badge"));
window.web_terminal = web_terminal;
var assistant = new Assistant(document.getElementById('assistant_container'), document.getElementById('assistant_button'));

// load plugins

import { VisualDebuggerUI } from "../../modules/debugger.js";

/**
 * The `default` branch of an exhaustive switch over an IPC union. A member no
 * case handles gives `value` a real type in place of `never`, and `tsc` fails.
 *
 * @param {never} value
 */
function assert_unreachable(value){
  console.error("Unhandled IPC message:", value);
}

// The page reads its controls through these, so the compiler knows a checkbox
// has `checked` and a text field has `value`. A bare `getElementById` gives
// only `HTMLElement`.

/**
 * @param {string} id
 * @returns {HTMLInputElement}
 */
function input_by_id(id){
  return /** @type {HTMLInputElement} */ (document.getElementById(id));
}

/**
 * @param {string} id
 * @returns {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement}
 */
function field_by_id(id){
  return /** @type {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} */ (
    document.getElementById(id)
  );
}

// navegation

class InterfaceNavegation{
  constructor(){
    this.tabs = ["home_tab", "hardware_tab", "os_tab", "terminal_tab", "debug_tab", "settings_tab"];
  }

  addTab(name, icon, id, content){
    this.tabs.push(id+ "_tab");
    settings_nav_item.insertAdjacentHTML('beforebegin', `
    <li class="nav-item list-group-item pl-1 py-2" id="${id}_nav_item">
      <a class="nav-link" href="#${id}">
          <div class="d-xl-flex flex-grow-0 align-items-xl-center"><i class="fas ${icon}"></i><span style="padding: 10px;">${name}</span></div>
      </a>
    </li>
    `);

    settings_tab.insertAdjacentHTML('beforebegin', `
    <div id="${id+ "_tab"}" class="content_area" hidden="true">
      ${content}
    </div>
    `);
  }

  /** Undo an `addTab`. A device that is removed must not leave its tab behind. */
  removeTab(id){
    const tabId = id + "_tab";
    this.tabs = this.tabs.filter(t => t !== tabId);
    const tab = document.getElementById(tabId);
    if (tab) tab.remove();
    const navItem = document.getElementById(id + "_nav_item");
    if (navItem) navItem.remove();
  }

  hideTab(id){
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }

  locationHashChanged(){
    this.tabs.map(this.hideTab);
    let targetId = location.hash.slice(1);
    let newHash = targetId + "_tab";

    document.querySelectorAll("aside nav ul li").forEach(li => li.classList.remove("active"));
    const activeNavItem = document.getElementById(targetId + "_nav_item");
    if (activeNavItem) activeNavItem.classList.add("active");

    if(this.tabs.includes(newHash)){
      const activeEl = document.getElementById(newHash);
      if (activeEl) activeEl.hidden = false;
      if (newHash === "terminal_tab" && web_terminal) {
        web_terminal.openTerminal();
      }
    }else{
      home_tab.hidden = false;
      const homeNav = document.getElementById("home_nav_item");
      if (homeNav) homeNav.classList.add("active");
      console.log(location.hash);
      if(location.hash.slice(0, 15) == "#select_content"){
        config.load_content(location.hash.split("=")[1]);
      }else if(location.hash.slice(0, 19) == "#select_url_content"){
        config.load_content_string(location.hash.slice(20));
      }
      location.hash = "";
    }
  }
}

export const navegation = new InterfaceNavegation();
window.onhashchange = navegation.locationHashChanged.bind(navegation);


// tables
var table_devices, table_syscalls;
document.addEventListener('DOMContentLoaded', function() {
  table_devices = new DataTable('#table_devices');
  table_syscalls = new DataTable('#table_syscalls');
});


class ConfigurationManager{
  constructor(){
    this.currentConfig = {options:{}, syscalls:{}, devices:{}}
    this.trackedOptions = {checkboxes: ["config_isaA", "config_isaC", "config_isaD", "config_isaF", "config_isaI", 
    "config_isaM", "config_isaS", "config_isaU", "enable_so_checkbox"], values: ["so_stack_pointer_value", "int_freq_range"]};
  }

  log_current_options(){
    for (const opt in this.trackedOptions.checkboxes) {
      const element = this.trackedOptions.checkboxes[opt];   
      this.currentConfig.options[element] = input_by_id(element).checked;
    }
    for (const opt in this.trackedOptions.values) {
      const element = this.trackedOptions.values[opt];   
      this.currentConfig.options[element] = field_by_id(element).value;
    }
  }

  add_device(name, slot){
    this.currentConfig.devices[name] = {slot: slot};
  }

  remove_device(name){
    if(this.currentConfig.devices[name]){
      mmio_manager.releaseSlot(this.currentConfig.devices[name].slot);
      delete this.currentConfig.devices[name];
    }
  }


  add_syscall(id, code){
    this.currentConfig.syscalls[id] = code;
  }

  remove_syscall(id){
    delete this.currentConfig.syscalls[id];
  }

  load_syscalls(){
    for (const id in this.currentConfig.syscalls) {
      const value = this.currentConfig.syscalls[id];
      simulator_controller.load_syscall(value.number, value.code);
    }
  }

  load_configuration_json(config_json){
    this.load_configuration(JSON.parse(config_json));
  }

  load_configuration(new_config){
    this.currentConfig = new_config;
    // options
    for (const opt in this.currentConfig.options) {
      const element = field_by_id(opt);
      if(!element){
        // Shared configuration links can carry options that this build no
        // longer has a control for. Skip them instead of failing the load.
        console.warn("Ignoring unknown configuration option:", opt);
        continue;
      }
      if(this.trackedOptions.checkboxes.includes(opt)){
        input_by_id(opt).checked = this.currentConfig.options[opt];
      }else{
        element.value = this.currentConfig.options[opt];
      }
    }
    freq_change();
    // devices
    for (const name in this.currentConfig.devices) {
      // The slot is a property of the entry; reading it off the key gave
      // `undefined`, so a shared configuration re-allocated every device.
      const slot = this.currentConfig.devices[name].slot;
      mmio_manager.getSlot(slot);
      window.load_device(name, slot);
    }
    // syscalls
    this.load_syscalls();
  }

  get_config_json(){
    return this.currentConfig;
  }

  load_content_string(base64Data){
    var cData = LZString.decompressFromEncodedURIComponent(atob(base64Data));
    var configs = JSON.parse(cData);
    content_selection.hidden = true;
    selected_content.hidden = false;
    selected_content.insertAdjacentHTML('beforeend', `<iframe style="width:100%;height:100%" src="${configs.main_page}" frameborder="0"></iframe>`);
    // The script arrives inside the URL, so the user has to approve it first.
    assistant.setScript(configs.assistant_script, {trusted: false});
    this.load_configuration(configs.config);
  }

  load_content(id) {
    content_selection.hidden = true;
    selected_content.hidden = false;
    // Arrow functions keep `this` bound to the ConfigurationManager, so
    // `this.load_configuration` resolves inside the fetch callbacks.
    fetch('./data/config.json').then((request) => {
      request.json().then((configs) => {
        selected_content.insertAdjacentHTML('beforeend', `<iframe style="width:100%;height:100%" src="${configs[id].main_page}" frameborder="0"></iframe>`);
        // This script comes from the application's own data files.
        assistant.setScript(configs[id].assistant_script, {trusted: true});
        this.load_configuration(configs[id].config);
      });
    });
  }
}

const config = new ConfigurationManager();


// utils

function download(filename, text) {
  var element = document.createElement('a');
  var url = URL.createObjectURL( new Blob( [text], {type:'text/plain'} ) );
  element.setAttribute('href', url);
  element.setAttribute('download', filename);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
  URL.revokeObjectURL(url);
}



//

const sim_status_ch = new BroadcastChannel('simulator_status' + window.uniq_id);

sim_status_ch.onmessage = function (ev) {
  /** @type {SimStatusChannelMessage} */
  const data = ev.data;
  if(data.type == "message"){
    let msgTypes = {
      success: (opts) => Toast.success(opts),
      info: (opts) => Toast.info(opts),
      error: (opts) => Toast.error(opts),
      notice: (opts) => Toast.notice(opts)
    };
    var delay = 8000;
    if(data.msg.delay){
      delay = data.msg.delay;
    }
    const fn = msgTypes[data.msg.type] || msgTypes.info;
    fn({
      title: data.msg.title,
      text: data.msg.text,
      delay
    });
  }
  switch (data.type) {
    case "sim_log":
      // settings_tab_simulator_log.insertAdjacentHTML('beforeend', data.msg + "<br>");
      break;

    case "status":
      if(data.status.running){
        run_button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Stop';
        run_button.setAttribute("class", "btn btn-danger");
        run_button.style.background = "";
        run_options_selector.setAttribute("disabled", "");
        run_button.onclick = function(){
          simulator_controller.restart_simulator();
        };
        if(!data.status.debugging){
          location.hash = "#terminal";
          navegation.locationHashChanged();
        }
      }else if(data.status.stopping || data.status.finish){

        run_button.innerHTML = 'Run';
        run_button.setAttribute("class", "btn btn-outline-success");
        run_button.style.background = "#FFFFFF";
        run_options_selector.removeAttribute("disabled");
        run_button.onclick = function(){run_simulator(false);};

        if (data.status.finish && data.status.error) {
          // A failed run must never be reported with the success statistics.
          const s = data.status.stats;
          const detail = data.status.errorMessage ||
            'The program did not finish successfully.';
          console.error("[Execution Failed]", detail, s);
          Toast.error({
            title: 'Execution Failed',
            text: s
              ? `${detail}\nInstructions: ${(s.totalInstructions || 0).toLocaleString()} | Exit Code: ${s.exitCode}`
              : detail,
            delay: Infinity
          });
        } else if (data.status.finish && data.status.stats) {
          const s = data.status.stats;
          console.log("[Toast Execution Complete]", s);
          const timeFormatted = s.elapsedTimeMs >= 1000
            ? (s.elapsedTimeMs / 1000).toFixed(3) + " s"
            : s.elapsedTimeMs.toFixed(2) + " ms";
          const instFormatted = (s.totalInstructions || 0).toLocaleString();
          Toast.success({
            title: 'Execution Complete',
            text: `Time: ${timeFormatted} | Instructions: ${instFormatted}\nSpeed: ${s.mips || 0} MIPS | Exit Code: ${s.exitCode}`,
            delay: 6000
          });
        }
      }
      if(data.status.starting){
        config.load_syscalls();
      }
      break;

    case "load_syscall":
      if(data.desc){
        add_syscall_to_table(data.number, data.desc, data.code);
      }
      break;

    case "clang_status":
      if(data.status.starting){
        if(!Modal.isOpen('#modal_terminal')){
          Modal.open('#modal_terminal', {backdrop: false});
          Modal.makeDraggable('#modal_terminal', '.modal-header');
          web_terminal.openTerminal();
        }
      }else{

        run_button.onclick = function(){run_simulator(false);};
      }
      break;

    case "load_file":
      Toast.info({
        title: 'File Loaded',
        text: 'Name: ' + data.name + '\n (' + data.size + ' bytes)'
      });
      break;

    case "debug_state":
      // The debug view renders it through the controller callbacks.
      break;

    case "message":
      // Already shown as a toast above.
      break;

    default:
      assert_unreachable(data);
  }
}

// upper menu

file_select_button.onclick = function () {
  document.getElementById("codeSelector").click();
} 

function load_file(){
  if(codeSelector.files.length){
    // label_codeSelector.innerHTML = codeSelector.files;
    run_button.setAttribute("class", "btn btn-outline-success");
    simulator_controller.load_files(codeSelector.files);
    compiler.set_file_array(simulator_controller.last_loaded_files);
    setTimeout(function () {
      codeSelector.value = "";
    }, 100);
    // run_button.style.background = "";
  }else{
    run_button.setAttribute("class", "btn btn-outline-secondary");
  }
};
codeSelector.onchange = load_file;

function get_checked_ISAs(){
  var ISAs = "";
  if(input_by_id("config_isaA").checked) ISAs += "a";
  if(input_by_id("config_isaC").checked) ISAs += "c";
  if(input_by_id("config_isaD").checked) ISAs += "d";
  if(input_by_id("config_isaF").checked) ISAs += "f";
  if(input_by_id("config_isaI").checked) ISAs += "i";
  if(input_by_id("config_isaM").checked) ISAs += "m";
  if(input_by_id("config_isaS").checked) ISAs += "s";
  if(input_by_id("config_isaU").checked) ISAs += "u";
  return ISAs;
}

async function auto_compile() {
  if(!input_by_id("auto_compile").checked) return -1;
  return await compiler.auto_compile(field_by_id("c_ext").value, field_by_id("asm_ext").value, field_by_id("obj_ext").value, field_by_id("elf_ext").value);
}

async function run_simulator(debug) {
  window.run_simulator = run_simulator;
  if(simulator_controller.last_loaded_files.length == 0){
    Toast.notice({
      title: 'No input files',
      text: 'Select at least one input file to run or compile'
    });
    return false;
  }
  if (!debug) {
    location.hash = "#terminal";
    navegation.locationHashChanged();
  }
  run_button.onclick = function () {console.log("Repeated click");};
  var filename = await auto_compile();
  if (compiler.loaded_files && compiler.loaded_files.length > 0) {
    simulator_controller.last_loaded_files = compiler.loaded_files;
  }
  if(!filename){
    for (let index = 0; index < simulator_controller.last_loaded_files.length; index++) {
      const element = simulator_controller.last_loaded_files[index];
      if(element.name.endsWith(field_by_id("elf_ext").value)) {
        filename = element.name;
        break;
      }
    }
  }
  if(!filename){
    const firstFile = simulator_controller.last_loaded_files[0];
    const elfExt = field_by_id("elf_ext").value;
    if (firstFile && (firstFile.name.endsWith(elfExt) || firstFile.name.endsWith(".elf") || firstFile.name.endsWith(".x") || firstFile.name.endsWith(".bin"))) {
      filename = firstFile.name;
    } else {
      Toast.error({
        title: 'Compilation Error',
        text: 'Failed to generate RISC-V ELF executable binary.'
      });
      run_button.innerHTML = 'Run';
      run_button.setAttribute("class", "btn btn-outline-success");
      run_button.style.background = "#FFFFFF";
      run_options_selector.removeAttribute("disabled");
      run_button.onclick = function(){run_simulator(false);};
      return false;
    }
  }
  var args = [];
  args.push('/' + String(filename).replace(" ", "_"));
  if(enable_so_checkbox.checked) {
    args.push("--newlib");
    args.push("--setreg", `sp=${so_stack_pointer_value.value}`);
  }
  if(debug) args.push("--interactive");
  args.push("--isa", get_checked_ISAs());
  simulator_controller.start_execution(args);
}

run_button.onclick = function(){run_simulator(false);};
run_with_debug_button.onclick = function(){
  location.hash = "#debug";
  run_simulator(true);
};


assistant_button.onclick = function () {
  Modal.open('#modal_assistant', {backdrop: false});
  Modal.makeDraggable('#modal_assistant', '.modal-header');
}



// home tab

function load_content_from_json(list, item_list) {
  for (const item in item_list) {
    const element = item_list[item];
    let params = element.params?element.params:"";
    var code = `
    <li class="list-group-item">
      <div class="card">
          <div class="card-body">
              <h4 class="card-title">${element.title}</h4>
              <h6 class="text-muted card-subtitle mb-2">${element.subtitle}</h6>
              <p class="card-text">${element.text}</p><a class="card-link" ${params} href="${element.link1}">${element.option1}</a><a class="card-link" ${params} href="${element.link2}">${element.option2}</a></div>
      </div>
    </li>
    ` 
    list.insertAdjacentHTML('beforeend',code);
  }
}

fetch('./data/home.json').then(function (request) {
  request.json().then(function (home_contents) {
    load_content_from_json(home_tab_tutorials_list, home_contents.tutorials);
    load_content_from_json(home_tab_resources_list, home_contents.resources);
  });
});

// hardware tab

function freq_change() {
  const value = Number(int_freq_range.value);
  if(value == 0){
    int_freq_range_indicator.innerHTML = "1/∞";
  }else{
    int_freq_range_indicator.innerHTML = "1/2<sup>"+ (32 - value) +"</sup>";
  }
  simulator_controller.set_int_freq_scale_limit(value);
}
int_freq_range.onchange = freq_change;

/** Device modules that are currently loaded, keyed by their file name. */
const loaded_devices = new Map();
window.loaded_devices = loaded_devices;

window.load_device = async function (name, slot){
  if(slot == undefined){
    slot = mmio_manager.getFreeSlot();
  }
  const rowId = "mapped_device_" + name.replace(/[^a-zA-Z0-9_]/g, "_");
  document.getElementById("mapped_devices_table").insertAdjacentHTML('beforeend', 
    `<tr id="${rowId}">
    <td>0xFFFF${slot.toString(16).padStart(4, '0')}<br />0xFFFF${(slot + mmio_manager.slot_size).toString(16).padStart(4, '0')}<br /><br /></td>
    <td>${name}</td>
    <td><a onclick="window.remove_device('${name}');"><i class="material-icons pointer">remove</i></a></td>
    </tr>
    `
  );
  const module = await import("../../extensions/devices/" + name);
  // The module has to be kept: removing the device later needs the instance
  // that holds the watches, the syscalls and the tab.
  loaded_devices.set(name, module.default);
  config.add_device(name, slot);
  module.default.device_name = name;
  module.default.setBaseAddress(slot);
}

window.remove_device = function (name){
  const device = loaded_devices.get(name);
  if(device){
    const syscall_numbers = (device.syscalls || []).map(s => s.number);
    try{
      device.teardown();
    }catch(e){
      console.error("Failed to tear down the device " + name + ":", e);
    }
    for(const number of syscall_numbers){
      simulator_controller.remove_syscall(number);
    }
    loaded_devices.delete(name);
  }
  // This releases the MMIO slot, so a device loaded again gets the same one.
  config.remove_device(name);
  const rowId = "mapped_device_" + name.replace(/[^a-zA-Z0-9_]/g, "_");
  const row = document.getElementById(rowId);
  if(row){
    row.remove();
  }
  Toast.info({
    title: 'Device removed',
    text: name
  });
}

window.device_action_formatter = function(value) {
  return `<a onclick="window.load_device('${value}');this.hidden = true;"><i class="material-icons pointer">add</i></a>`;
}


// os tab

window.load_syscall = function(serialized) {
  /** @type {SyscallTableEntry} */
  const value = JSON.parse(unescape(serialized));
  if(input_by_id(`syscall_checkbox-${value.number}`).checked){
    simulator_controller.load_syscall(value.number, value.code);
    config.add_syscall(value.number, value);
  }else{
    simulator_controller.remove_syscall(value.number);
    config.remove_syscall(value.number);
  }
}

function add_syscall_to_table(number, desc, code) {
  if (table_syscalls) {
    table_syscalls.insertRow({
      index: 0,
      row: {
        "number": number,
        "desc": desc,
        "action": {builtin: false, number, code, checked:"checked"}
      }
    });
  }
}


/** @param {SyscallTableEntry} value */
window.syscall_action_formatter = function(value) {
  if(value.builtin){
    return `<div class="custom-control custom-control-inline disabled custom-switch"><input type="checkbox" class="custom-control-input" id="syscall_checkbox-${value.number}" checked disabled /><label class="custom-control-label" for="syscall_checkbox-${value.number}"></label></div>`;
  }
  return `<div class="custom-control custom-control-inline disabled custom-switch" onchange="window.load_syscall('${escape(JSON.stringify(value))}');"><input type="checkbox" class="custom-control-input" id="syscall_checkbox-${value.number}" ${value.checked}/><label class="custom-control-label" for="syscall_checkbox-${value.number}"></label></div>`;
}

os_tab_stdio_refresh.onclick = function() {
  if(os_tab_stdin_radio.checked){
    web_terminal.setSTDIN(os_tab_stdio_textarea.value)
    Toast.info({
      title: 'Text loaded to STDIN',
      text: `${os_tab_stdio_textarea.value.length} chars loaded.`
    });
  }else if(os_tab_stdout_radio.checked){
    os_tab_stdio_textarea.value = web_terminal.getSTDOUT()
  }else{
    os_tab_stdio_textarea.value = web_terminal.getSTDERR()
  }
};

os_tab_stdin_radio.onchange = function () {
  if(os_tab_stdin_radio.checked){
    os_tab_stdio_upload.removeAttribute("disabled");
  }else{
    os_tab_stdio_upload.setAttribute("disabled", "");
  }
}

os_tab_stdio_upload.onclick = function () {
  stdio_file_input.click();
}

stdio_file_input.onchange = function() {
  if(stdio_file_input.files.length){
    var file = stdio_file_input.files[0];
    var reader = new FileReader();
    reader.readAsText(file, "UTF-8");
    reader.onload = function () {
      os_tab_stdio_textarea.value = String(reader.result);
    };
    reader.onerror = function (evt) {
      console.log("error reading file", evt);
    };
  }
}

os_tab_stdio_download.onclick = function() {
  download("stdio.txt", os_tab_stdio_textarea.value);
}

// tab settings_tab_simulator_log

function generate_config_link(){
  config.log_current_options();
  const conf = config.get_config_json();
  if(conf_export_assistant_script.files.length){
    var file = conf_export_assistant_script.files[0];
    var reader = new FileReader();
    reader.readAsText(file, "UTF-8");
    reader.onload = function (evt) {
      settings_tab_conf_export_desc.value = location.origin + location.pathname + "#select_url_content=" + btoa(LZString.compressToEncodedURIComponent(JSON.stringify({main_page: conf_export_desc_url.value, assistant_script: evt.target.result, config: conf})));
    }.bind(this);
    reader.onerror = function (evt) {
      console.log("error reading file", evt);
    };
  }else{
    settings_tab_conf_export_desc.value = location.origin + location.pathname + "#select_url_content=" + btoa(LZString.compressToEncodedURIComponent(JSON.stringify({main_page: conf_export_desc_url.value, assistant_script: "", config: conf})));
  }
}

settings_tab_conf_generate.onclick = generate_config_link;

settings_tab_conf_export.onclick = function () {
  generate_config_link();
  navigator.clipboard.writeText(settings_tab_conf_export_desc.value).then(function() {
    Toast.info({
      title: 'Link copied to clipboard'
    });
  }, function(err) {
    console.error('Could not copy text: ', err);
  });
}

navegation.locationHashChanged();
load_file();
freq_change();