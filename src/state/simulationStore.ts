import {
  createDefaultSimulationState,
  createSimulationLogEntry,
  type SimulationClock,
  type SimulationDevice,
  type SimulationGoal,
  type SimulationLogEntry,
  type SimulationState,
  type SimulationTask,
  type WorldSnapshot,
} from '../types';

export function touchStateClock(clock: SimulationClock): SimulationClock {
  return {
    ...clock,
    step: clock.step + 1,
    wallClockAt: new Date().toISOString(),
  };
}

export function replaceWorldInState(state: SimulationState, world: WorldSnapshot): SimulationState {
  return {
    ...state,
    phase: state.phase === 'booting' ? 'idle' : state.phase,
    clock: touchStateClock(state.clock),
    world: {
      ...world,
      updatedAt: new Date().toISOString(),
    },
    logs: state.logs.concat(
      createSimulationLogEntry({
        level: 'info',
        scope: 'world',
        message: '世界快照已更新。',
      }),
    ),
  };
}

export function appendDeviceToState(state: SimulationState, device: SimulationDevice): SimulationState {
  const nextDevice = {
    ...device,
    updatedAt: new Date().toISOString(),
  };
  const nextDevices = state.devices.some((item) => item.id === device.id)
    ? state.devices.map((item) => (item.id === device.id ? nextDevice : item))
    : state.devices.concat(nextDevice);

  return {
    ...state,
    phase: state.phase === 'booting' ? 'idle' : state.phase,
    clock: touchStateClock(state.clock),
    devices: nextDevices,
    logs: state.logs.concat(
      createSimulationLogEntry({
        level: 'info',
        scope: 'device',
        message: `设备已${state.devices.some((item) => item.id === device.id) ? '更新' : '注册'}。`,
        details: device.id,
      }),
    ),
  };
}

export function removeDeviceFromState(state: SimulationState, deviceId: string): SimulationState {
  return {
    ...state,
    clock: touchStateClock(state.clock),
    devices: state.devices.filter((device) => device.id !== deviceId),
    logs: state.logs.concat(
      createSimulationLogEntry({
        level: 'info',
        scope: 'device',
        message: '设备已移除。',
        details: deviceId,
      }),
    ),
  };
}

export function appendGoalToState(state: SimulationState, goal: SimulationGoal): SimulationState {
  const nextGoal = {
    ...goal,
    updatedAt: new Date().toISOString(),
  };
  const nextGoals = state.goals.some((item) => item.id === goal.id)
    ? state.goals.map((item) => (item.id === goal.id ? nextGoal : item))
    : state.goals.concat(nextGoal);

  return {
    ...state,
    phase: 'running',
    clock: touchStateClock(state.clock),
    goals: nextGoals,
    tasks: mergeGoalTasks(state.tasks, goal),
    logs: state.logs.concat(
      createSimulationLogEntry({
        level: 'info',
        scope: 'goal',
        message: `目标已${state.goals.some((item) => item.id === goal.id) ? '更新' : '提交'}。`,
        details: goal.id,
      }),
    ),
  };
}

export function appendLogToState(state: SimulationState, logEntry: Omit<SimulationLogEntry, 'id' | 'timestamp'>) {
  return {
    ...state,
    logs: state.logs.concat(createSimulationLogEntry(logEntry)),
  };
}

export function resetSimulationState() {
  return createDefaultSimulationState();
}

function mergeGoalTasks(tasks: SimulationTask[], goal: SimulationGoal): SimulationTask[] {
  if (!goal.childTaskIds.length) {
    return tasks;
  }

  return tasks.map((task) =>
    goal.childTaskIds.includes(task.id)
      ? {
          ...task,
          goalId: goal.id,
          updatedAt: new Date().toISOString(),
        }
      : task,
  );
}

export { createDefaultSimulationState };

