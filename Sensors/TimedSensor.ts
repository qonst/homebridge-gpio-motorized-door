import { Sensor } from "./Sensor";

export class TimedSensor extends Sensor {
    private timeoutHandler: NodeJS.Timer = null;
    private state: boolean = false;
    private readonly log: LogFunction;
    private triggerTimeout: number;

    constructor(name: string, initialState: boolean, triggerTimeout: number, log: LogFunction) {
        super(name);
        this.log = log;
        this.triggerTimeout = triggerTimeout;
        this.state = initialState;
        this.log(`${this.name} created, timeout ${triggerTimeout}`);
    }

    public delayedTrigger(newState: boolean) {
        this.clearTimeTrigger();
        this.log(`${this.name} setting timeout (${this.triggerTimeout} seconds)`);
        this.timeoutHandler = setTimeout(() => {
            this.log(`${this.name}: timeout reached`);
            this.trigger(newState);
        }, this.triggerTimeout * 1000);
    }

    public get active(): boolean {
        return this.state;
    }

    public clearTimeTrigger(): void {
        if (this.timeoutHandler !== null) {
            this.log(`${this.name} clearing timeout`);
            clearTimeout(this.timeoutHandler);
            this.timeoutHandler = null;
        }
    }

    public trigger(value: boolean): void {
        this.log(`${this.name} triggerede: ${value}`);
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
