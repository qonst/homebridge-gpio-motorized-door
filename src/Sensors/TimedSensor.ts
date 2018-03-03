import { Sensor } from "./Sensor";

export class TimedSensor extends Sensor {
    private timeoutHandler: NodeJS.Timer | null = null;
    private state: boolean = false;
    private readonly triggerTimeout: number;

    constructor(name: string, initialState: boolean, triggerTimeout: number, log: (msg: string) => void) {
        super(name, log);
        this.triggerTimeout = triggerTimeout;
        this.state = initialState;
    }

    public delayedTrigger(newState: boolean) {
        this.clearTimeTrigger();
        this.log(`setting timeout (${this.triggerTimeout} seconds)`);
        this.timeoutHandler = setTimeout(() => {
            this.log(`${this.name}: timeout reached`);
            this.trigger(newState);
        }, this.triggerTimeout);
    }

    public get active(): boolean {
        return this.state;
    }

    public clearTimeTrigger(): void {
        if (this.timeoutHandler !== null) {
            this.log(`clearing timeout`);
            clearTimeout(this.timeoutHandler);
            this.timeoutHandler = null;
        }
    }

    public trigger(value: boolean): void {
        this.log(`triggered: ${value}`);
        this.clearTimeTrigger();
        if (this.active === value) {
            return;
        }
        this.state = value;
        if (value) {
            this.onSensorActivating.dispatch(this);
        } else {
            this.onSensorDeactivating.dispatch(this);
        }
    }
}
