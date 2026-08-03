/*jshint esversion: 9 */
import {Device} from "../utils.js";

class Cleaner_robot extends Device{
  setup(){
    this.addTab("Roomba", "fa-robot", "uoli", `
      <iframe style="width:100%;height:100%" id="uoliWindow" src="./extensions/devices/dependencies/uoli-unity/index.html" frameborder="0"></iframe>
    `);
    document.getElementById("uoliWindow").onload = (function(){
      this.unityModule = document.getElementById("uoliWindow").contentWindow.unityInstance;
      document.getElementById("uoliWindow").contentWindow.setUoliCallbacks(this.uoliStatus.bind(this), this.uoliSensorStatus.bind(this), function(){
        this.unityModule.SendMessage("walle", "keyboardInputToogle", 0);
      }.bind(this));
    }).bind(this);
  }

  constructor(...args){
    super(...args);
    this.addCard(`
    <div class="card-body">
      <h5 class="card-title">Robot Vacuum Cleaner</h5>
      <p class="card-text">
        Simulates a 2-motor robot in a house environment<br>
        <span id="status_roomba" class="badge badge-secondary">Disabled</span>
      </p>
      <a href="#" id="load_roomba" class="btn btn-primary">Load Device</a>
    </div>
    `);
    document.getElementById("load_roomba").onclick = this.load.bind(this);
    this.HTMLstatus = document.getElementById("status_roomba");
  }

  load(){
    this.setBigArea("./devices/dependencies/roomba-unity/index.html", "roombaWindow");
    document.getElementById("roombaWindow").onload = (function(){
      this.unityModule = document.getElementById("roombaWindow").contentWindow.unityInstance;
      document.getElementById("roombaWindow").contentWindow.setRoombaCallback(this.roombaStatus.bind(this), function(){
        this.unityModule.SendMessage("RoombaModel", "keyboardInputToogle", 0);
      }.bind(this));
      this.setup();
      this.HTMLstatus.innerHTML = "Enabled";
      this.HTMLstatus.setAttribute("class", "badge badge-success");
    }).bind(this);
    this.broadcastChannel = new BroadcastChannel('mmio_broadcast');
    this.broadcastChannel.onmessage = this.mmioHandler.bind(this);
  }

  mmioHandler(bc_msg){
    var msg = bc_msg.data;
    if(msg.type == "write"){
      if(msg.addr == 0xFFFF0004 && msg.value == 0){
        this.getRobotPosition();
      }else if(msg.addr == 0xFFFF000C){
        this.unityModule.SendMessage("RoombaModel", "SetMotor1Torque", (msg.value >> 16) / 10);
        var m2 = (msg.value&0xFFFF);
        m2 = (m2 & 0x8000) ? (m2 | 0xFFFF0000) : m2;
        this.unityModule.SendMessage("RoombaModel", "SetMotor2Torque", m2 / 10);
      }
    }
  }

  moveRobot(reg){
    if(reg.a0 == 1){
      this.unityModule.SendMessage("RoombaModel", "setMovement", reg.a1/10);
    }else if(reg.a0 == 2){
      this.unityModule.SendMessage("RoombaModel", "setRotation", reg.a1);
    }else if(reg.a0 == 3){
      this.unityModule.SendMessage("RoombaModel", "SetMotor1Torque", reg.a1/10);
      this.unityModule.SendMessage("RoombaModel", "SetMotor2Torque", reg.a2/10);
    }
  }

  roombaStatus(rot, pos){
    var position = (parseInt(rot) << 20) | (parseInt(pos.x*10) << 10) | 
                    parseInt(pos.z * 10);
    this.simulator.mmio.store(0xFFFF0008, 4, position);
    this.simulator.mmio.store(0xFFFF0004, 4, 1);
  }

  getRobotPosition(){
    this.unityModule.SendMessage("RoombaModel", "getStatus");
  }

  setup(){
    if(this.unityModule == undefined){
      return;
    }
    var syscallMotor =`
      sendMessage({a0, a1, a2});
    `;
    this.simulator.registerSyscall(2100, syscallMotor, this.moveRobot.bind(this));
    var syscallStatus =`
      mmio.store(0xFFFF0004, 4, 0);
      while(mmio.load(0xFFFF0004, 4) == 0){};
      a0 = mmio.load(0xFFFF0008, 4);
    `;
    this.simulator.registerSyscall(2104, syscallStatus, this.getRobotPosition.bind(this));
  }

}