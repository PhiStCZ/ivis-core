jest.mock('../../lib/knex');
jest.mock('../../lib/alerts-condition-parser');
jest.mock('../../lib/mailer')
jest.mock('../../lib/SMS-sender');
jest.mock('../../lib/config');
jest.mock('moment');

const { Alert } = require('../../lib/alerts-class');
const { advanceClock, resetTime } = require('moment');

let fields = null;

beforeEach(() => {
    resetTime();
    jest.useFakeTimers();
    fields = {
        id: 1,
        name: "Testing Alert",
        description: "Alerts Description",
        sigset: 1,
        duration: 0,
        delay: 0,
        interval: 0,
        condition: "false",
        emails: "johndoe@notexist.ne\njanedoe@notexist.ne\nivisuser@notexist.ne",
        phones: "123456789\n987654321\n147258369",
        repeat: 15,
        finalnotification: 1,
        instant_revoke: 0,
        enabled: 1,
        namespace: 1,
        created: "2021-04-01 10:00:00",
        state: "good",
        state_changed: "2021-04-01 10:00:00",
        interval_time: "2021-04-01 10:00:00"
    };
});

afterEach(() => {
    jest.clearAllTimers();
});

async function advanceTime(seconds) {
    advanceClock(seconds);
    jest.advanceTimersByTime(seconds * 1000);
    await 0; // this is just to yield thread and allow timed functions to make changes
}

test('immediate change #1', async () => {
    fields.condition = 'true';
    const alert = new Alert(fields);
    await alert.init();
    await alert.execute();
    expect(alert.fields.state).toBe('bad');
});

test('immediate change #2', async () => {
    fields.condition = 'false';
    const alert = new Alert(fields);
    await alert.init();
    await alert.execute();
    expect(alert.fields.state).toBe('good');
});

test('immediate change #3', async () => {
    fields.condition = 'true';
    fields.state = 'bad';
    const alert = new Alert(fields);
    await alert.init();
    await alert.execute();
    expect(alert.fields.state).toBe('bad');
});

test('immediate change #4', async () => {
    fields.condition = 'false';
    fields.state = 'bad';
    const alert = new Alert(fields);
    await alert.init();
    await alert.execute();
    expect(alert.fields.state).toBe('good');
});

test('delayed change #1', async () => {
    fields.condition = 'true';
    fields.duration = 3;
    const alert = new Alert(fields);
    await alert.init();
    await alert.execute();
    expect(alert.fields.state).toBe('worse');
});

test('delayed change #2', async () => {
    fields.condition = 'true';
    fields.duration = 3;
    const alert = new Alert(fields);
    await alert.init();
    await alert.execute();
    await advanceTime(181);
    expect(alert.fields.state).toBe('bad');
    expect(alert.fields.state_changed).toBe("2021-04-01 10:03:01");
});

test('delayed change #3', async () => {
    fields.condition = 'false';
    fields.state = 'bad';
    fields.delay = 3;
    const alert = new Alert(fields);
    await alert.init();
    await alert.execute();
    expect(alert.fields.state).toBe('better');
});

test('delayed change #4', async () => {
    fields.condition = 'false';
    fields.state = 'bad';
    fields.delay = 3;
    const alert = new Alert(fields);
    await alert.init();
    await alert.execute();
    await advanceTime(181);
    expect(alert.fields.state).toBe('good');
});

test('delayed change aborted #1', async () => {
    fields.condition = 'true';
    fields.duration = 3;
    const alert = new Alert(fields);
    await alert.init();
    await alert.execute();
    await advanceTime(100);
    expect(alert.fields.state).toBe('worse');
    alert.fields.condition = 'false';
    await alert.execute();
    expect(alert.fields.state).toBe('good');
});

test('delayed change aborted #2', async () => {
    fields.condition = 'false';
    fields.state = 'bad';
    fields.delay = 3;
    const alert = new Alert(fields);
    await alert.init();
    await alert.execute();
    await advanceTime(100);
    expect(alert.fields.state).toBe('better');
    alert.fields.condition = 'true';
    await alert.execute();
    expect(alert.fields.state).toBe('bad');
});

test('update #1', async () => {
    fields.state = 'bad';
    let fields2 = {...fields};
    const alert = new Alert(fields);
    await alert.init();
    fields2.enabled = 0;
    await alert.update(fields2);
    expect(alert.fields.state).toBe('good');
});

test('update #2', async () => {
    fields.state = 'bad';
    const alert = new Alert(fields);
    await alert.init();
    let fields2 = {...fields};
    fields2.condition = 'true';
    await alert.update(fields2);
    expect(alert.fields.state).toBe('good');
});

test('update #3', async () => {
    const alert = new Alert(fields);
    await alert.init();
    await advanceTime(194);
    let fields2 = {...fields};
    fields2.interval = 2;
    await alert.update(fields2);
    expect(alert.fields.interval_time).toBe('2021-04-01 10:03:14');
});

test('update #4', async () => {
    fields.enabled = 0;
    const alert = new Alert(fields);
    await alert.init();
    await advanceTime(194);
    let fields2 = {...fields};
    fields2.enabled = 1;
    await alert.update(fields2);
    expect(alert.fields.interval_time).toBe('2021-04-01 10:03:14');
});

test('update #5', async () => {
    fields.state = 'bad';
    const alert = new Alert(fields);
    await alert.init();
    await advanceTime(194);
    let fields2 = {...fields};
    fields2.repeat = 20;
    await alert.update(fields2);
    expect(alert.fields.interval_time).toBe('2021-04-01 10:00:00');
    expect(alert.fields.state).toBe('bad');
});

test('restart during worse', async () => {
    fields.state = 'worse';
    fields.duration = 2;
    await advanceTime(115);
    const alert = new Alert(fields);
    await alert.init();
    expect(alert.fields.state).toBe('worse');
    await advanceTime(10);
    expect(alert.fields.state).toBe('bad');
});

test('restart after worse', async () => {
    fields.state = 'worse';
    fields.duration = 2;
    await advanceTime(125);
    const alert = new Alert(fields);
    await alert.init();
    expect(alert.fields.state).toBe('bad');
});

test('restart during better', async () => {
    fields.state = 'better';
    fields.delay = 2;
    await advanceTime(115);
    const alert = new Alert(fields);
    await alert.init();
    expect(alert.fields.state).toBe('better');
    await advanceTime(10);
    expect(alert.fields.state).toBe('good');
});

test('restart after better', async () => {
    fields.state = 'better';
    fields.duration = 2;
    await advanceTime(125);
    const alert = new Alert(fields);
    await alert.init();
    expect(alert.fields.state).toBe('good');
});

test('disabled', async () => {
    fields.enabled = 0;
    fields.condition = 'true';
    const alert = new Alert(fields);
    await alert.init();
    await alert.execute();
    expect(alert.fields.state).toBe('good');
});

test('interval #1', async () => {
    fields.interval = 4;
    const alert = new Alert(fields);
    await alert.init();
    expect(alert.fields.interval_time).toBe("2021-04-01 10:00:00");
    await advanceTime(123);
    await alert.execute();
    expect(alert.fields.interval_time).toBe("2021-04-01 10:02:03")
});

test('interval #2', async () => {
    fields.interval = 4;
    const alert = new Alert(fields);
    await alert.init();
    await advanceTime(241);
    expect(alert.fields.interval_time).toBe("2021-04-01 10:04:01")
});

test('interval #3', async () => {
    fields.interval = 4;
    await advanceTime(241);
    const alert = new Alert(fields);
    await alert.init();
    expect(alert.fields.interval_time).toBe("2021-04-01 10:04:01")
});

test('interval #4', async () => {
    fields.interval = 4;
    await advanceTime(230);
    const alert = new Alert(fields);
    await alert.init();
    expect(alert.fields.interval_time).toBe("2021-04-01 10:00:00")
    await advanceTime(11);
    expect(alert.fields.interval_time).toBe("2021-04-01 10:04:01")
});

test('wrong evaluation', async () => {
    fields.condition = 'abc';
    const alert = new Alert(fields);
    await alert.init();
    await alert.execute();
    expect(alert.fields.state).toBe('good');
});

test('termination', async () => {
    fields.condition = 'true';
    fields.duration = 1;
    const alert = new Alert(fields);
    await alert.init();
    await alert.execute();
    await advanceTime(50);
    alert.terminate();
    await advanceTime(50);
    expect(alert.fields.state).toBe('worse');
});

test('instant revoke #1', async () => {
    fields.condition = 'true';
    fields.instant_revoke = 1;
    const alert = new Alert(fields);
    await alert.init();
    await alert.execute();
    expect(alert.fields.state).toBe('good');
});

test('instant revoke #2', async () => {
    fields.state = 'bad';
    let fields2 = {...fields};
    const alert = new Alert(fields);
    await alert.init();
    fields2.instant_revoke = 1;
    await alert.update(fields2);
    expect(alert.fields.state).toBe('good');
});

test('instant revoke #3', async () => {
    fields.state = 'worse';
    fields.duration = 1;
    fields.instant_revoke = 1;
    let fields2 = {...fields};
    const alert = new Alert(fields);
    await alert.init();
    fields2.instant_revoke = 0;
    await alert.update(fields2);
    expect(alert.fields.state).toBe('good');
});

test('instant revoke #4', async () => {
    fields.condition = 'true';
    fields.instant_revoke = 1;
    fields.duration = 3;
    const alert = new Alert(fields);
    await alert.init();
    await alert.execute();
    await advanceTime(181);
    expect(alert.fields.state).toBe('good');
    expect(alert.fields.state_changed).toBe("2021-04-01 10:03:01");
});
