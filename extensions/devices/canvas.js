/*jshint esversion: 9 */
import {Device} from "./utils.js";

class Canvas extends Device{
  setup(){
    this.addTab("Canvas", "fa-paint-brush", "canvas_device", `
    <!--  <div class="form-group">
    <label for="canvas_scale_x">Scale X</label>
    <input type="text" class="form-control" name="canvas_scale_x" id="canvas_scale_x" placeholder="" value=1>
    </div>
    <div class="form-group">
    <label for="canvas_scale_y">Scale Y</label>
    <input type="text" class="form-control" name="canvas_scale_y" id="canvas_scale_y" placeholder="" value=1>
    </div> --> 
    <div class="form-group">
    <label for="canvas_size_x">Width:</label>
    <input type="text" class="form-control" name="canvas_size_x" id="canvas_size_x" placeholder="" value=512>
    </div>
    <div class="form-group">
    <label for="canvas_size_y">Height:</label>
    <input type="text" class="form-control" name="canvas_size_y" id="canvas_size_y" placeholder="" value=512>
    </div>
    <button type="button" class="btn btn-primary" id="canvas_reset">Reset Canvas</button>
    <button type="button" class="btn btn-primary" id="canvas_open_canvas">Open Canvas</button>
    `);


    settings_tab.insertAdjacentHTML('beforebegin', `
    <div class="modal fade" role="dialog" tabindex="-1" id="modal_canvas" data-keyboard="false" data-backdrop="static">
    <div class="modal-dialog modal-xl modal-dialog-centered" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <h4 class="modal-title">Canvas</h4><button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">×</span></button>
        </div>
        <div class="modal-body" style="overflow-x: auto;">
          <canvas id="canvas_device_canvas"></canvas>
        </div>
      </div>
    </div>
    </div>
    `);

    document.getElementById("canvas_open_canvas").onclick = _ => {
      if(!($("#modal_canvas").data('bs.modal') || {})._isShown){
        $('#modal_canvas').modal({backdrop: false,show: true});
        $('#modal_canvas').draggable({handle: ".modal-header"});
      }
    }

    document.getElementById("canvas_reset").onclick = _ => {
      // this.ctx.scale(document.getElementById("canvas_scale_x").value, 
      //                document.getElementById("canvas_scale_y").value);
      this.imageData = this.ctx.createImageData(document.getElementById("canvas_size_x").value, 
                                                document.getElementById("canvas_size_y").value);
      this.width = parseInt(document.getElementById("canvas_size_x").value);
    }


    this.canvas = document.getElementById("canvas_device_canvas");
    this.ctx = this.canvas.getContext('2d');
    this.imageData = this.ctx.createImageData(512, 512);
    this.canvas.width = 512;
    this.canvas.height = 512;
    this.width = 512;

    setInterval(_=>{
      this.ctx.putImageData(this.imageData, 0, 0);
    }, 100);
    var syscall =`
      sendMessage({a0, a1, a2});
    `;
    this.registerSyscall(2200, "Canvas setPixel", syscall, function (reg) {
      const idx = (reg.a1*this.width + reg.a0)*4
      this.imageData.data[idx + 0] = (reg.a2>>24)&0xFF ;  // R value
      this.imageData.data[idx + 1] = (reg.a2>>16)&0xFF;    // G value
      this.imageData.data[idx + 2] = (reg.a2>>8)&0xFF;  // B value
      this.imageData.data[idx + 3] = reg.a2&0xFF;  // A value
    }.bind(this));
    this.registerSyscall(2201, "Canvas setCanvasSize", syscall, function (reg) {
      this.width = reg.a0;
      this.imageData = this.ctx.createImageData(reg.a0, reg.a1);
    }.bind(this));
    this.registerSyscall(2202, "Canvas setScaling", syscall, function (reg) {
      this.imageData = this.scaleImageData(this.imageData, reg.a0, reg.a1);
    }.bind(this));

    this.bus.watchAddress(this.base_addr, function (value) {
      const size = this.bus.mmio.load(this.base_addr + 2, 2);
      const start = this.bus.mmio.load(this.base_addr + 4, 4);
      for (let i = 0; i < size; i++) {
        const element = this.bus.mmio.load(this.base_addr + 8 + i, 1);
        this.imageData.data[start + i] = element;
      }
      this.bus.mmio.store(this.base_addr, 1, 0);
    }.bind(this), 1, 1);
  }

  scaleImageData(imageData, scaleX, scaleY) {
    // Create a temporary canvas to hold the original ImageData
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    // Set the temporary canvas dimensions to match the ImageData
    tempCanvas.width = imageData.width;
    tempCanvas.height = imageData.height;
    
    // Put the original ImageData onto the temporary canvas
    tempCtx.putImageData(imageData, 0, 0);
    
    // Create a new canvas with scaled dimensions
    const scaledCanvas = document.createElement('canvas');
    const scaledCtx = scaledCanvas.getContext('2d');
    
    // Set the new canvas dimensions to the scaled size
    scaledCanvas.width = imageData.width * scaleX;
    scaledCanvas.height = imageData.height * scaleY;
    
    // Use drawImage to scale the temporary canvas content onto the new canvas
    scaledCtx.drawImage(tempCanvas, 0, 0, imageData.width, imageData.height, 0, 0, scaledCanvas.width, scaledCanvas.height);
    
    // Get the scaled ImageData from the new canvas
    return scaledCtx.getImageData(0, 0, scaledCanvas.width, scaledCanvas.height);
  }
}

const canvas = new Canvas();
export default canvas;