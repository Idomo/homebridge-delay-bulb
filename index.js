

var Service, Characteristic;

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-delay-switch", "DelaySwitch", delaySwitch);
}


function delaySwitch(log, config, api) {
    let UUIDGen = api.hap.uuid;

    this.log = log;
    this.name = config['name'];
    this.delay = config['delay'] || 0;
    this.delayUnit = config['delay'] || "miliseconds";
    this.debug = config.debug || false
    this.sensorType = config['sensorType'];
    if (typeof this.sensorType === 'undefined')
        this.sensorType = 'motion'
    this.flipSensor = config['flipSensorState'];
    this.disableSensor = config['disableSensor'] || !config['sensorType'];
    this.startOnReboot = config['startOnReboot'] || false;
    this.timer;
    this.switchOn = false;
    this.sensorTriggered = 0;
    this.uuid = UUIDGen.generate(this.name)
    
    // define debug method to output debug logs when enabled in the config
    this.log.easyDebug = (...content) => {
        if (this.debug) {
            this.log(content.reduce((previous, current) => {
                return previous + ' ' + current
            }))
        } else
            this.log.debug(content.reduce((previous, current) => {
                return previous + ' ' + current
            }))
    }

    this.getSensorState = () => {
        state = this.sensorTriggered
        if (this.flipSensor && this.sensorType === 'motion')
            return !state
        if (this.sensorType === 'motion')
            return !!state
        if (this.flipSensor)
            return state^1
        return state
    }
}

delaySwitch.prototype.getServices = function () {
    var informationService = new Service.AccessoryInformation();

    informationService
        .setCharacteristic(Characteristic.Manufacturer, "Delay Switch")
        .setCharacteristic(Characteristic.Model, `Delay-${this.delay}ms`)
        .setCharacteristic(Characteristic.SerialNumber, this.uuid);


    this.switchService = new Service.Switch(this.name);


    this.switchService.getCharacteristic(Characteristic.On)
        .on('get', this.getOn.bind(this))
        .on('set', this.setOn.bind(this));

    if (this.startOnReboot)
        this.switchService.setCharacteristic(Characteristic.On, true)
    
    var services = [informationService, this.switchService]
    
    if (!this.disableSensor){
        switch (this.sensorType) {
            case 'contact':
                this.sensorService = new Service.ContactSensor(this.name + ' Trigger');
                this.sensorCharacteristic = Characteristic.ContactSensorState
                break;
            case 'occupancy':
                this.sensorService = new Service.OccupancySensor(this.name + ' Trigger');
                this.sensorCharacteristic = Characteristic.OccupancyDetected
                break;
            case 'leak':
                this.sensorService = new Service.LeakSensor(this.name + ' Trigger');
                this.sensorCharacteristic = Characteristic.LeakDetected
                break;
            default:
                this.sensorService = new Service.MotionSensor(this.name + ' Trigger');
                this.sensorCharacteristic = Characteristic.MotionDetected
                break;
        }

        this.sensorService
            .getCharacteristic(this.sensorCharacteristic)
            .on('get', (callback) => {
                callback(null, this.getSensorState())
            });

        services.push(this.sensorService)
    }

    return services;

}


delaySwitch.prototype.setOn = function (on, callback) {

    if (!on) {
        this.log.easyDebug('Stopping the Timer');
    
        this.switchOn = false;
        clearTimeout(this.timer);
        this.sensorTriggered = 0;
        if (!this.disableSensor) this.sensorService.getCharacteristic(this.sensorCharacteristic).updateValue(this.getSensorState());

        
      } else {
        this.switchOn = true;
        clearTimeout(this.timer);
        if (this.delay > 0) {
            this.log.easyDebug('Starting the Timer');
            this.timer = setTimeout(function() {
              this.log.easyDebug('Time is Up!');
              this.switchService.getCharacteristic(Characteristic.On).updateValue(false);
              this.switchOn = false;
                
              if (!this.disableSensor) {
                  this.sensorTriggered = 1;
                  this.sensorService.getCharacteristic(this.sensorCharacteristic).updateValue(this.getSensorState());
                  this.log.easyDebug('Triggering Sensor');
                  setTimeout(function() {
                    this.sensorTriggered = 0;
                    this.sensorService.getCharacteristic(this.sensorCharacteristic).updateValue(this.getSensorState());
                  }.bind(this), 3000);
              }
              
            }.bind(this), this.delay);
        }
      }
    
      callback();
}



delaySwitch.prototype.getOn = function (callback) {
    callback(null, this.switchOn);
}
