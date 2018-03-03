"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const simple_events_1 = require("strongly-typed-events/dist/simple-events");
class Sensor {
    constructor(name) {
        this.name = name;
        this.onSensorActivating = new simple_events_1.SimpleEventDispatcher();
        this.onSensorDeactivating = new simple_events_1.SimpleEventDispatcher();
    }
    get onActivated() {
        return this.onSensorActivating.asEvent();
    }
    get onDeactivated() {
        return this.onSensorDeactivating.asEvent();
    }
}
exports.Sensor = Sensor;
//# sourceMappingURL=Sensor.js.map