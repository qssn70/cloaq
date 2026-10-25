// Empty coordinates are unset; zero is a valid latitude or longitude.
export const parseCoordinate = (value, axis) => {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const number = Number(value)
  const limit = axis === 'latitude' ? 90 : axis === 'longitude' ? 180 : null
  if (limit === null) throw new RangeError('Unknown coordinate axis')
  if (!Number.isFinite(number) || number < -limit || number > limit)
    throw new RangeError(`Invalid ${axis}: expected -${limit} to ${limit}`)
  return number
}
