import type { Func } from '@micro-app/types'
import { isFunction } from '../libs/utils'

const constructorMap = new WeakMap<Func | FunctionConstructor, boolean>()
function isConstructor (value: Func | FunctionConstructor) {
  if (constructorMap.has(value)) {
    return constructorMap.get(value)
  }

  const valueStr = value.toString()

  const result = (
    value.prototype &&
    value.prototype.constructor === value &&
    Object.getOwnPropertyNames(value.prototype).length > 1
  ) ||
    /^function\s+[A-Z]/.test(valueStr) ||
    /^class\s+/.test(valueStr)

  constructorMap.set(value, result)

  return result
}

const rawWindowMethodMap = new WeakMap<CallableFunction, CallableFunction>()
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export default function bindFunction (rawWindow: Window, value: any): unknown {
  if (rawWindowMethodMap.has(value)) {
    return rawWindowMethodMap.get(value)
  }

  if (isFunction(value) && !isConstructor(value)) {
    const bindRawWindowValue = value.bind(rawWindow)

    for (const key in value) {
      bindRawWindowValue[key] = value[key]
    }

    if (value.hasOwnProperty('prototype') && !bindRawWindowValue.hasOwnProperty('prototype')) {
      bindRawWindowValue.prototype = value.prototype
    }

    rawWindowMethodMap.set(value, bindRawWindowValue)
    return bindRawWindowValue
  }

  return value
}
