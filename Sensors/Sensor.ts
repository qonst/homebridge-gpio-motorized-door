import { SimpleEventDispatcher } from "strongly-typed-events/dist/simple-events";

export abstract class Sensor {

    protected readonly onSensorActivating = new SimpleEventDispatcher<Sensor>();
    protected readonly onSensorDeactivating = new SimpleEventDispatcher<Sensor>();

    constructor(readonly name: string) { }

    public abstract get active(): boolean;

    public get onActivated() {
        return this.onSensorActivating.asEvent();
    }

    public get onDeactivated() {
        return this.onSensorDeactivating.asEvent();
    }
}
