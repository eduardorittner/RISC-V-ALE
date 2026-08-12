/**
 * IPC Schema Validation Module for RISC-V ALE Worker Messages
 */

export const WORKER_MESSAGE_TYPES = [
  'init_modules',
  'code_load',
  'start',
  'stdin',
  'interrupt',
  'sync',
  'debug_enable',
  'debug_step',
  'debug_step_over',
  'debug_step_out',
  'debug_continue',
  'debug_pause',
  'debug_set_bp',
  'debug_clear_bps',
  'debug_read_mem',
  'debug_poke_reg',
  'debug_poke_mem',
  'debug_disasm',
  'debug_get_snapshot',
  'add_files',
  'load_syscall',
  'disable_syscall',
  'interrupt_enabled',
  'set_freq_limit',
  'set_int_delay',
  'non_blocking_io',
  'interactive',
  'start_sim',
  'status',
  'device_message',
  'sim_log',
  'debug_state',
  'debug_mem_data',
  'debug_disasm_data',
  'debug_bp_updated',
  'debug_status',
];

export function validateWorkerMessage(msg) {
  if (!msg || typeof msg !== 'object') {
    return { success: false, error: 'Message must be a non-null object' };
  }

  if (typeof msg.type !== 'string' || !msg.type.trim()) {
    return { success: false, error: 'Message missing valid "type" property' };
  }

  switch (msg.type) {
    case 'init_modules':
      if (!msg.riscvModule && !msg.whisperModule) {
        return { success: false, error: 'init_modules requires riscvModule' };
      }
      break;

    case 'code_load':
      if (!msg.code || (typeof msg.code !== 'object' && !Array.isArray(msg.code))) {
        return { success: false, error: 'code_load requires code array/object' };
      }
      break;

    case 'start':
      if (!Array.isArray(msg.args)) {
        return { success: false, error: 'start message requires args array' };
      }
      break;

    case 'stdin':
      if (typeof msg.stdin !== 'string') {
        return { success: false, error: 'stdin message requires string stdin' };
      }
      break;

    case 'interrupt':
      if (typeof msg.state !== 'number') {
        return { success: false, error: 'interrupt message requires numeric state' };
      }
      break;

    case 'sync':
      // main->worker has buffer, worker->main has mmio_buffer/stdout/stderr
      if (!msg.buffer && !msg.mmio_buffer && msg.stdout === undefined && msg.stderr === undefined) {
        return { success: false, error: 'sync message requires buffer, mmio_buffer, or stdout/stderr payload' };
      }
      break;

    case 'debug_enable':
      if (typeof msg.enabled !== 'boolean') {
        return { success: false, error: 'debug_enable requires boolean enabled' };
      }
      break;

    case 'debug_set_bp':
      if (typeof msg.addr !== 'number' || typeof msg.active !== 'boolean') {
        return { success: false, error: 'debug_set_bp requires numeric addr and boolean active' };
      }
      break;

    case 'debug_read_mem':
    case 'debug_disasm':
      if (typeof msg.addr !== 'number' || typeof msg.len !== 'number') {
        return { success: false, error: `${msg.type} requires numeric addr and len` };
      }
      break;

    case 'debug_poke_reg':
      if (typeof msg.reg !== 'number' || typeof msg.val !== 'number') {
        return { success: false, error: 'debug_poke_reg requires numeric reg and val' };
      }
      break;

    case 'debug_poke_mem':
      if (typeof msg.addr !== 'number' || typeof msg.val !== 'number') {
        return { success: false, error: 'debug_poke_mem requires numeric addr and val' };
      }
      break;

    case 'status':
      if (!msg.status || typeof msg.status !== 'object') {
        return { success: false, error: 'status message requires status object payload' };
      }
      break;

    default:
      if (!WORKER_MESSAGE_TYPES.includes(msg.type)) {
        return { success: false, error: `Unknown message type: ${msg.type}` };
      }
      break;
  }

  return { success: true };
}
