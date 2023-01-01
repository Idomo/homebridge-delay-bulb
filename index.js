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
    this.delay = config['delay'];
    this.sensorType = config['sensorType'];
    if (typeof this.sensorType === 'undefined')
        this.sensorType = 'motion'
    this.flipSensor = config['flipSensorState'];
    this.disableSensor = config['disableSensor'] || !config['sensorType'];
    this.startOnReboot = config['startOnReboot'];
    this.actAsBulb = config['actAsBulb'] || false;
    this.timer;
    this.switchOn = false;
    this.brightness = 0;
    this.sensorTriggered = 0;
    this.uuid = UUIDGen.generate(this.name)

    delaySwitch.prototype.createMainService = function (name) {
        if (this.mainService) return this.mainService;
        if (this.actAsBulb) return this.createLightBulb(name);
        return new Service.Switch(name);
    }

    delaySwitch.prototype.createLightBulb = function (name) {
        const service = new Service.Lightbulb(name);

        service.getCharacteristic(Characteristic.Brightness)
            .on('get', cb => cb(null, this.brightness))
            .on('set', this.setBrightness.bind(this));

        return service;
    }

    this.getSensorState = () => {
        state = this.sensorTriggered
        if (this.flipSensor && sensorType === 'motion')
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

    this.mainService = this.createMainService(this.name);

    this.mainService.getCharacteristic(Characteristic.On)
        .on('get', this.getOn.bind(this))
        .on('set', this.setOn.bind(this));

    if (this.startOnReboot)
        this.mainService.setCharacteristic(Characteristic.On, true)
    
    var services = [informationService, this.mainService]
    
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

delaySwitch.prototype.updateBrightness = function () {
    const unit = this.delay;
    this.timer = setTimeout(() => {
        this.brightness = this.brightness - 1;

        this.mainService.getCharacteristic(Characteristic.Brightness).updateValue(this.brightness);
        this.log(`${this.brightness} remains`);

        if (this.brightness <= 0) {
            this.timeout();
        } else {
            this.updateBrightness();
        }
    }, unit);
}

delaySwitch.prototype.setBrightness = function (brightness, callback) {
    this.log(`Set the Timer with ${brightness}%`);

    this.brightness = brightness;

    clearTimeout(this.timer);

    if (0 < brightness) {
        this.updateBrightness();
    }

    callback();
}

delaySwitch.prototype.timeout = function () {
    this.log('Time is Up!');
    this.mainService.getCharacteristic(Characteristic.On).updateValue(false);
    this.switchOn = false;

    if (!this.disableSensor) {
        this.sensorTriggered = 1;
        this.sensorService.getCharacteristic(this.sensorCharacteristic).updateValue(this.getSensorState());
        this.log('Triggering Sensor');
        setTimeout(function() {
            this.sensorTriggered = 0;
            this.sensorService.getCharacteristic(this.sensorCharacteristic).updateValue(this.getSensorState());
        }.bind(this), 3000);
    }
}

delaySwitch.prototype.setOn = function (on, callback) {
    if (!on) {
        this.log('Stopping the Timer');

        this.switchOn = false;
        clearTimeout(this.timer);
        this.sensorTriggered = 0;
        if (!this.disableSensor) 
            this.sensorService.getCharacteristic(this.sensorCharacteristic).updateValue(this.getSensorState());
        } else {
        this.log('Starting the Timer');
        this.switchOn = true;

        if (!this.actAsBulb) {
            clearTimeout(this.timer);
            this.timer = setTimeout(function () {
                this.timeout();
            }.bind(this), this.delay);
        }
    }

    callback();
}

delaySwitch.prototype.getOn = function (callback) {
    callback(null, this.switchOn);
}
