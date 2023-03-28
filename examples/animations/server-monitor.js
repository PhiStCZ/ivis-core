'use strict';

const si = require('systeminformation');

class ServerMonitor {
    constructor() {
        this.status = {
            isPlaying: false,
            position: 0,
            data: {
                cpu_load: {
                    current: {avg: 0},
                    user: {avg: 0},
                    system: {avg: 0},
                },
                mem_status: {
                    total: {avg: 0},
                    free: {avg: 0},
                    used: {avg: 0},
                },
                disk_load: {
                    readIOPerSec: {avg: 0},
                    writeIOPerSec: {avg: 0},
                    totalIOPerSec: {avg: 0},
                }
            },
        };

        this.refreshStatsBound = this.refreshStats.bind(this);
    }

    static async getCPULoad() {
        const loadInfo = await si.currentLoad();

        return {
            current: {avg: loadInfo.currentload},
            user: {avg: loadInfo.currentload_user},
            system: {avg: loadInfo.currentload_system},
        };
    }

    static async getMemStatus() {
        const memInfo = await si.mem();

        return {
            total: {avg: memInfo.total},
            free: {avg: memInfo.free},
            used: {avg: memInfo.used},
        };
    }

    static async getDiskLoad() {
        const diskStat = await si.disksIO();

        return {
            readIOPerSec: {avg: diskStat.rIO_sec},
            writeIOPerSec: {avg: diskStat.wIO_sec},
            totalIOPerSec: {avg: diskStat.tIO_sec},
        };
    }

    async refreshStats() {
        const cpu_load = await ServerMonitor.getCPULoad();

        const mem_status = await ServerMonitor.getMemStatus();

        const disk_load = await ServerMonitor.getDiskLoad();

        this.updateStatus({data: { cpu_load, mem_status, disk_load}});
    }

    updateStatus(newStatus) {
        Object.assign(this.status, newStatus);
        this.status.position = Date.now();
    }


    startMonitoring() {
        this.refreshStats();
        this.refreshInterval = setInterval(this.refreshStatsBound, 100);
    }

    stopMonitoring() {
        clearInterval(this.refreshInterval);
    }

    getStatus() {
        return {...this.status};
    }

    play() {
        if (this.status.isPlaying) return;

        this.updateStatus({isPlaying: true});
        this.startMonitoring();
    }

    pause() {
        this.updateStatus({isPlaying: false});
        this.stopMonitoring();
    }
}

module.exports.create = function create() {
    return new ServerMonitor();
}
