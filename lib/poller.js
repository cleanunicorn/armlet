const fetch = require('omni-fetch')
const moment = require('moment')

const util = require('./util')

/**
 * Throws timeout error.
 *
 * @param {Number} timeout Number of milliseconds to wait for analysis requiest to finish
 * @param {String} uuid Analysis UUID to use in the error message.
 */
function failOnTimeout (timeout, uuid) {
  const t = moment.duration(timeout).as('seconds')
  /* eslint-disable no-throw-literal */
  throw (
    `User-specified or default time out reached after ${t} seconds.\n` +
    'Analysis continues on server and may have completed; so run again?\n' +
    `For status reference, UUID is ${uuid}\n`
  )
  /* eslint-enable no-throw-literal */
}

/**
 * Handles error responses, throwing errors, if necessary.
 *
 * @param {Object} response HTTP response.
 * @param {String} accessToken gives access to use MythX service
 */
async function handleErrors (response, accessToken) {
  const { status } = response
  if (status < 200 || status > 299) {
    let msg
    switch (status) {
      case 404:
        msg = `Unauthorized analysis request, access token: ${accessToken}`
        break
      default:
        msg = (await response.json()).error
    }
    // eslint-disable-next-line no-throw-literal
    throw msg
  }
}

/**
 * Gets the array of issues from the API.
 *
 * @param {String} uuid Analysis UUID.
 * @param {String} accessToken gives access to use MythX service
 * @param {Object} apiUrl URL object.
 * @return {Promise} Resolves with API response payload, or rejects with
 *  an error object.
 */
async function getIssues (uuid, accessToken, apiUrl) {
  const res = await fetch(`${apiUrl.origin}/v1/analyses/${uuid}/issues`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })
  await handleErrors(res, accessToken)
  return res.json()
}
exports.getIssues = getIssues

/**
 * Poll wait on an analysis request.
 *
 * @param {String} uuid Analysis UUID.
 * @param {String} accessToken gives access to use MythX service
 * @param {Object} apiUrl URL object.
 * @return {Promise} Resolves with API response payload, or rejects with
 *  an error object.
 */
async function ping (uuid, accessToken, apiUrl) {
  /* Checks analysis status. */
  let res = await fetch(`${apiUrl.origin}/v1/analyses/${uuid}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })
  await handleErrors(res, accessToken)
  const { status } = await res.json()
  switch (status) {
    case 'Finished': break
    /* eslint-disable no-throw-literal */
    case 'Error': throw 'Analysis failed'
    /* eslint-enable no-throw-literal */
    default: return null
  }

  return getIssues(uuid, accessToken, apiUrl)
}

// No matter how long the timeout, maxPolls is the number of requests
// that will happen per analysis request.
const maxPolls = 10
exports.maxPolls = maxPolls

/**
 * Gets the list of issues detected by the API for the specified analysis,
 * waiting until the analysis is finished up to a given polling interval.
 *
 * @param {String} uuid Analysis UUID.
 * @param {String} accessToken Auth token.
 * @param {Object} apiUrl URL object of API base (without /v1, though).
 * @param {Number} timeout Optional. Operation timeout [ms]. Defaults to 30 sec.
 * @param {Number} initialTimeout Optional. Operation timeout [ms]. Defaults to 30 sec.
 *  (For initial polling only)
 * @return {Promise} Resolves to the list of issues, or rejects with an error.
 */
exports.do = async function (
  uuid,
  accessToken,
  apiUrl,
  timeout = 60000,
  intialDelay = 30000
) {
  /* The initial delay is already awaited by the caller. */
  let pollsCount = 0
  let pollStep = 1000
  const startTime = Date.now()
  await util.timer(intialDelay)
  while (Date.now() - startTime < timeout && pollsCount < maxPolls) {
    const res = await ping(uuid, accessToken, apiUrl)
    if (res) return res
    await util.timer(Math.min(pollStep, startTime + timeout - Date.now()))
    pollsCount += 1
    pollStep *= 2
  }
  failOnTimeout(timeout, uuid)
}
