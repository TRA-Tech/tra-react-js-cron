import { MutableRefObject } from 'react'

import {
  SetValueNumbersOrUndefined,
  CronType,
  SetValuePeriod,
  SetInternalError,
  OnError,
  Locale,
  PeriodType,
  CronValues,
  Classes,
  AllowEmpty,
  LeadingZero,
  ClockFormat,
  Shortcuts,
} from './types'
import { DEFAULT_LOCALE_EN } from './locale'
import {
  HUMANIZED_WEEK_DAYS_LABELS,
  HUMANIZED_MONTHS_LABELS,
  SUPPORTED_SHORTCUTS,
} from './constants'

// Set cron (string like * * * * *)
export function setCron(
  string: string,
  setInternalError: SetInternalError,
  onError: OnError,
  allowEmpty: AllowEmpty,
  internalValueRef: MutableRefObject<string>,
  firstRender: boolean,
  locale: Locale,
  shortcuts: Shortcuts,
  setMinutes: SetValueNumbersOrUndefined,
  setHours: SetValueNumbersOrUndefined,
  setMonthDays: SetValueNumbersOrUndefined,
  setWeekDays: SetValueNumbersOrUndefined,
  setMonths: SetValueNumbersOrUndefined,
  setPeriod: SetValuePeriod
) {
  let stringValue = string

  onError && onError(undefined)
  setInternalError(false)

  let error = false

  if (!stringValue) {
    if (
      allowEmpty === 'always' ||
      (firstRender && allowEmpty === 'for-default-value')
    ) {
      return
    }

    error = true
  }

  const needShortcuts =
    shortcuts && (shortcuts === true || shortcuts.includes(stringValue as any))

  if (needShortcuts && stringValue === '@reboot') {
    setPeriod('reboot')

    return
  }

  const values: CronValues = {
    period: undefined,
    minutes: undefined,
    hours: undefined,
    months: undefined,
    'week-days': undefined,
    'month-days': undefined,
  }

  if (!error) {
    const assignValueOrError = (item: string, type: CronType) => {
      // Convert "*/1" to "*"
      if (item === '*/1') {
        values[type] = '*'
      } else {
        const cronValue = getCronValueFromString(item, type)

        if (cronValue !== undefined) {
          values[type] = cronValue
        } else {
          error = true
        }
      }
    }

    if (needShortcuts) {
      const shortcutObject = SUPPORTED_SHORTCUTS.find(
        (supportedShortcut) => supportedShortcut.name === stringValue
      )

      if (shortcutObject) {
        stringValue = shortcutObject.value
      }
    }

    try {
      // Sanitize
      const cronString = stringValue
        .replace(/\s+/g, ' ')
        .replace(/^ +/, '')
        .replace(/ +$/, '')
      const mask = cronString
        .replace(/\*\//g, '')
        .replace(/[^* ]/g, '-')
        .replace(/-+/g, '-')
        .replace(/ +/g, '')
      const items = cronString.split(' ')

      if (items.length !== 5) {
        error = true
      }

      if (mask === '*****') {
        values.period = 'minute'
      } else if (mask === '-****') {
        values.period = 'hour'
        assignValueOrError(items[0], 'minutes')
      } else if (mask.substring(2, mask.length) === '***') {
        values.period = 'day'
        assignValueOrError(items[0], 'minutes')
        assignValueOrError(items[1], 'hours')
      } else if (
        mask.substring(2, mask.length) === '-**' ||
        mask.substring(2, mask.length) === '-*-'
      ) {
        values.period = 'month'
        assignValueOrError(items[0], 'minutes')
        assignValueOrError(items[1], 'hours')
        assignValueOrError(items[2], 'month-days')
        assignValueOrError(
          getHumanizedStringFromArray(items[4], HUMANIZED_WEEK_DAYS_LABELS),
          'week-days'
        )
      } else if (mask.substring(2, mask.length) === '**-') {
        values.period = 'week'
        assignValueOrError(items[0], 'minutes')
        assignValueOrError(items[1], 'hours')
        assignValueOrError(
          getHumanizedStringFromArray(items[4], HUMANIZED_WEEK_DAYS_LABELS),
          'week-days'
        )
      } else if (
        mask.substring(3, mask.length) === '-*' ||
        mask.substring(3, mask.length) === '--'
      ) {
        values.period = 'year'
        assignValueOrError(items[0], 'minutes')
        assignValueOrError(items[1], 'hours')
        assignValueOrError(items[2], 'month-days')
        assignValueOrError(
          getHumanizedStringFromArray(items[3], HUMANIZED_MONTHS_LABELS),
          'months'
        )
        assignValueOrError(
          getHumanizedStringFromArray(items[4], HUMANIZED_WEEK_DAYS_LABELS),
          'week-days'
        )
      } else {
        error = true
      }
    } catch (e) {
      error = true
    }
  }

  if (!error) {
    Object.entries(values).forEach(([key, value]) => {
      if (value !== undefined) {
        let newValue = value === '*' ? undefined : value

        if (Array.isArray(newValue)) {
          if ((key as CronType) === 'week-days') {
            // Convert "7" to "0" because "7" also means Sunday
            newValue = newValue.map((v) => (v === 7 ? 0 : v))
          }

          // Remove duplicates in case of "2-4,4" string input
          newValue = newValue.filter((v, i, a) => a.indexOf(v) === i)

          // Sort to handle string like "4,1-3"
          newValue = newValue.sort((a: number, b: number) => a - b)
        }

        switch (key as CronType) {
          case 'period':
            setPeriod(newValue as PeriodType)
            break
          case 'minutes':
            setMinutes(newValue as number[])
            break
          case 'hours':
            setHours(newValue as number[])
            break
          case 'week-days':
            setWeekDays(newValue as number[])
            break
          case 'month-days':
            setMonthDays(newValue as number[])
            break
          case 'months':
            setMonths(newValue as number[])
            break

          default:
            break
        }
      }
    })
  } else {
    internalValueRef.current = stringValue
    setInternalError(true)
    onError &&
      onError({
        type: 'invalid_cron',
        description:
          locale.errorInvalidCron || DEFAULT_LOCALE_EN.errorInvalidCron,
      })
  }
}

// Get a cron value array from a string, ex: "2-5" => "[2,3,4,5]"
function getCronValueFromString(string: string, type: CronType) {
  let stringValue = string
  const value: number[] = []

  if (stringValue !== '*') {
    // A "return" means that the expression is not valid
    while (stringValue !== '') {
      let m: RegExpMatchArray | null
      const startValue = itemStartAt(type)
      const limit = itemMaxNumber(type) + startValue

      // Test "*/n" expression
      m = stringValue.match(/^\*\/([0-9]+),?/)
      if (m && m.length === 2) {
        const matchNumbers = m.map((v: string) => Number(v))

        if (matchNumbers[1] >= limit || matchNumbers[1] === 0) {
          return
        }

        for (let i = 0; i < limit; i += matchNumbers[1] | 0) {
          // Used to always start multiple from 0 and add matchNumbers[1]
          if (i >= startValue) {
            value.push(i)
          }
        }

        stringValue = stringValue.replace(m[0], '')
        continue
      }
      // Test "a-b/n" expression
      m = stringValue.match(/^([0-9]+)-([0-9]+)\/([0-9]+),?/)
      if (m && m.length === 4) {
        const matchNumbers = m.map((v: string) => Number(v))

        if (
          matchNumbers[1] < startValue ||
          matchNumbers[2] >= limit ||
          matchNumbers[3] >= limit ||
          matchNumbers[3] === 0 ||
          matchNumbers[1] > matchNumbers[2]
        ) {
          return
        }

        for (
          let i = matchNumbers[1] | 0;
          i <= (matchNumbers[2] | 0);
          i += matchNumbers[3] | 0
        ) {
          value.push(i)
        }

        stringValue = stringValue.replace(m[0], '')
        continue
      }
      // Test "a-b" expression
      m = stringValue.match(/^([0-9]+)-([0-9]+),?/)
      if (m && m.length === 3) {
        const matchNumbers = m.map((v: string) => Number(v))

        if (
          matchNumbers[1] < startValue ||
          matchNumbers[2] >= limit ||
          matchNumbers[1] > matchNumbers[2]
        ) {
          return
        }

        for (let i = matchNumbers[1] | 0; i <= (matchNumbers[2] | 0); i++) {
          value.push(i)
        }

        stringValue = stringValue.replace(m[0], '')
        continue
      }
      // Test "c" expression
      m = stringValue.match(/^([0-9]+),?/)
      if (m && m.length === 2) {
        const matchNumbers = m.map((v: string) => Number(v))

        if (matchNumbers[1] >= limit || matchNumbers[1] < startValue) {
          return
        }

        value.push(matchNumbers[1] | 0)

        stringValue = stringValue.replace(m[0], '')
        continue
      }

      return
    }
  }

  return value
}

// Get a cron value string from array of number, ex: "[2,3,4,5]" => "2-5"
export function getCronValueFromNumbers(
  arrayNumberValue: number[] | undefined,
  type: CronType,
  humanize?: boolean,
  leadingZero?: LeadingZero,
  clockFormat?: ClockFormat
) {
  if (!arrayNumberValue || arrayNumberValue.length === 0) {
    return '*'
  }

  const cron: string[] = getCronArrayOfString(arrayNumberValue)

  if (cron.length > 1) {
    const multiple = Number(cron[0]) === 0 ? Number(cron[1]) : Number(cron[0])

    const total = getTotalItem(multiple, type)

    if (total === cron.length) {
      let valid = true
      let counter = 0

      for (let i = 1; i < cron.length; i++) {
        counter += multiple

        if (Number(cron[i]) % multiple !== 0 || multiple * i !== counter) {
          valid = false
          break
        }
      }

      if (valid) {
        return '*/' + multiple
      }
    }
  }

  const transformedCron: string[] = getTransformedCronArrayOfString(
    arrayNumberValue,
    type,
    humanize,
    leadingZero,
    clockFormat
  )

  return transformedCron.join(',')
}

export function getCron(
  period: PeriodType,
  months: number[] | undefined,
  monthDays: number[] | undefined,
  weekDays: number[] | undefined,
  hours: number[] | undefined,
  minutes: number[] | undefined,
  humanizeValue: boolean
) {
  if (period === 'reboot') {
    return '@reboot'
  }

  const items = ['*', '*', '*', '*', '*']

  if (period !== 'minute') {
    items[0] = getCronValueFromNumbers(minutes, 'minutes')
  }

  if (
    period === 'day' ||
    period === 'week' ||
    period === 'month' ||
    period === 'year'
  ) {
    items[1] = getCronValueFromNumbers(hours, 'hours')
  }

  if (period === 'month' || period === 'year') {
    items[2] = getCronValueFromNumbers(monthDays, 'month-days')
  }

  if (period === 'year') {
    items[3] = getCronValueFromNumbers(months, 'months', humanizeValue)
  }

  if (period === 'week' || period === 'month' || period === 'year') {
    items[4] = getCronValueFromNumbers(weekDays, 'week-days', humanizeValue)
  }

  return items.join(' ')
}

export function itemMaxNumber(type: CronType) {
  switch (type) {
    case 'minutes':
      return 60
    case 'hours':
      return 24
    case 'month-days':
      return 31
    case 'months':
      return 12
    default:
      // 8 week days because Sunday can be 0 or 7
      return 8
  }
}

export function itemStartAt(type: CronType) {
  switch (type) {
    case 'minutes':
    case 'hours':
      return 0
    case 'month-days':
      return 1
    case 'months':
      return 1
    default:
      // week-days
      return 0
  }
}

function getTotalItem(multiple: number, type: CronType) {
  let total = 0

  switch (type) {
    case 'minutes':
      total = 60 - itemStartAt(type)
      break
    case 'hours':
      total = 24 - itemStartAt(type)
      break
    case 'month-days':
      total = 31 - itemStartAt(type)
      break
    case 'months':
      total = 12 - itemStartAt(type)
      break
    case 'week-days':
      total = 7 - itemStartAt(type)
      break
  }

  if (multiple) {
    let lastMultiple = 0
    for (let i = 0; i < total; i++) {
      if (i % multiple !== 0) continue
      lastMultiple = i
    }
    return lastMultiple / multiple + 1
  }

  return total
}

// Simple classNames util function to prevent adding external library 'classnames'
export function classNames(classes: Classes) {
  return Object.entries(classes)
    .filter(([key, value]) => key && value)
    .map(([key]) => key)
    .join(' ')
}

function getHumanizedStringFromArray(
  string: string,
  humanizedLabels: string[]
) {
  let humanizedString = string

  humanizedLabels.forEach((label, index) => {
    if (label) {
      const re = new RegExp(label, 'gi')
      humanizedString = humanizedString.replace(re, index.toString())
    }
  })

  return humanizedString
}

export function getTransformedStringFromNumber(
  number: number,
  type: CronType,
  humanize?: boolean,
  leadingZero?: LeadingZero,
  clockFormat?: ClockFormat
) {
  let defaultStr = number.toString()
  const needLeadingZero =
    leadingZero && (leadingZero === true || leadingZero.includes(type as any))
  const need24HourClock =
    clockFormat === '24-hour-clock' && (type === 'hours' || type === 'minutes')

  if (type === 'week-days' && humanize) {
    defaultStr = HUMANIZED_WEEK_DAYS_LABELS[number]
  } else if (type === 'months' && humanize) {
    defaultStr = HUMANIZED_MONTHS_LABELS[number]
  } else if (number < 10 && (needLeadingZero || need24HourClock)) {
    defaultStr = defaultStr.padStart(2, '0')
  }

  if (type === 'hours' && clockFormat === '12-hour-clock') {
    const suffix = number >= 12 ? 'PM' : 'AM'
    let hour: number | string = number % 12 || 12

    if (hour < 10 && needLeadingZero) {
      hour = hour.toString().padStart(2, '0')
    }

    defaultStr = `${hour}${suffix}`
  }

  return defaultStr
}

function getCronArrayOfString(arrayNumberValue: number[]) {
  const cron: string[] = [arrayNumberValue[0].toString()]

  let s = arrayNumberValue[0]
  let c = arrayNumberValue[0]
  const n = arrayNumberValue.length

  for (let i = 1; i < n; i++) {
    if (arrayNumberValue[i] === c + 1) {
      c = arrayNumberValue[i]

      cron[cron.length - 1] = `${s}-${c}`
    } else {
      s = c = arrayNumberValue[i]

      cron.push(c.toString())
    }
  }

  return cron
}

function getTransformedCronArrayOfString(
  arrayNumberValue: number[],
  type: CronType,
  humanize?: boolean,
  leadingZero?: LeadingZero,
  clockFormat?: ClockFormat
) {
  const cron: string[] = [
    getTransformedStringFromNumber(
      arrayNumberValue[0],
      type,
      humanize,
      leadingZero,
      clockFormat
    ),
  ]

  let s = arrayNumberValue[0]
  let c = arrayNumberValue[0]
  const n = arrayNumberValue.length

  for (let i = 1; i < n; i++) {
    if (arrayNumberValue[i] === c + 1) {
      c = arrayNumberValue[i]

      cron[cron.length - 1] = `${getTransformedStringFromNumber(
        s,
        type,
        humanize,
        leadingZero,
        clockFormat
      )}-${getTransformedStringFromNumber(
        c,
        type,
        humanize,
        leadingZero,
        clockFormat
      )}`
    } else {
      s = c = arrayNumberValue[i]

      cron.push(
        getTransformedStringFromNumber(
          c,
          type,
          humanize,
          leadingZero,
          clockFormat
        )
      )
    }
  }

  return cron
}
