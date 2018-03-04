import { SimpleEventDispatcher } from "strongly-typed-events/dist/simple-events";
import { ISimpleEvent } from "strongly-typed-events/dist/definitions/subscribables";

export abstract class Sensor {
    protected readonly log: (msg: string) => void;

    protected readonly onSensorActivating = new SimpleEventDispatcher<Sensor>();
    protected readonly onSensorDeactivating = new SimpleEventDispatcher<Sensor>();

    constructor(readonly name: string, log: (msg: string) => void) {
        this.log = (msg) => log(`${this.name}: ${msg}`);
    }

    public abstract get active(): boolean;

    public get onActivated() {
        return this.onSensorActivating.asEvent();
    }

    public get onDeactivated() {
        return this.onSensorDeactivating.asEvent();
    }
}
