const armlet = require('../index')
const Client = require('../index').Client
const sinon = require('sinon')
const url = require('url')
const HttpErrors = require('http-errors')
require('chai')
  .use(require('chai-as-promised'))
  .should()

const requester = require('../lib/requester')
const simpleRequester = require('../lib/simpleRequester')
const poller = require('../lib/poller')
const login = require('../lib/login')
const refresh = require('../lib/refresh')

const email = 'user@example.com'
const ethAddress = '0x74B904af705Eb2D5a6CDc174c08147bED478a60d'
const userId = '123456'
const password = 'my-password'

describe('main module', () => {
  const data = { deployedBytecode: 'my-bitecode' }
  const apiUrl = 'http://localhost:3100'

  describe('#armlet', () => {
    describe('#interface', () => {
      afterEach(() => {
        requester.do.restore()
        poller.do.restore()
        simpleRequester.do.restore()
      })

      beforeEach(() => {
        sinon.stub(requester, 'do')
          .returns(new Promise((resolve, reject) => resolve(true)))
        sinon.stub(poller, 'do')
          .returns(new Promise((resolve, reject) => resolve(true)))
        sinon.stub(simpleRequester, 'do')
          .returns(new Promise((resolve, reject) => resolve(true)))
      })

      describe('Client', () => {
        it('should be a function', () => {
          armlet.Client.should.be.a('function')
        })

        describe('should have a constructor which should', () => {
          it('initialize with trial userId', () => {
            const instance = new Client()

            instance.userId.should.be.deep.equal(armlet.trialUserId)
          })

          it('require a password auth option if email is provided', () => {
            (() => new Client({ email })).should.throw(TypeError)
          })

          it('require a password auth option if ethAddress is provided', () => {
            (() => new Client({ ethAddress })).should.throw(TypeError)
          })

          it('require a password auth option if userId is provided', () => {
            (() => new Client({ userId })).should.throw(TypeError)
          })

          it('does not require a password auth option if userId is trialUserId', () => {
            (() => new Client({ userId: armlet.trialUserId })).should.not.throw(TypeError)
          })

          it('initialize with trialUserId when neither user id nor password auth options are provided', () => {
            const instance = new Client({ })

            instance.userId.should.be.deep.equal(armlet.trialUserId)
          })

          it('require an user id auth option', () => {
            (() => new Client({ password })).should.throw(TypeError)
          })

          it('require a valid apiUrl if given', () => {
            (() => new Client({ email, password }, 'not-a-valid-url')).should.throw(TypeError)
          })

          it('initialize apiUrl to a default value if not given', () => {
            const instance = new Client({ email, password })

            instance.apiUrl.should.be.deep.equal(armlet.defaultApiUrl)
          })

          it('initialize apiUrl to the given value', () => {
            const instance = new Client({ email, password }, apiUrl)

            instance.apiUrl.should.be.deep.equal(new url.URL(apiUrl))
          })

          it('accept an apiKey auth and store it as accessToken', () => {
            const instance = new Client({ apiKey: 'my-apikey' })

            instance.accessToken.should.be.equal('my-apikey')
          })

          describe('instances should', () => {
            beforeEach(() => {
              this.instance = new Client({ email, password })
            })

            it('be created with a constructor', () => {
              this.instance.constructor.name.should.be.equal('Client')
            })
            describe('have an analyze method which', () => {
              it('should be a function', () => {
                this.instance.analyze.should.be.a('function')
              })

              it('should require a deployedBytecode option', async () => {
                await this.instance.analyze().should.be.rejectedWith(TypeError)
              })
            })
            describe('have an analyses method which', () => {
              it('should be a function', () => {
                this.instance.analyses.should.be.a('function')
              })

              it('should require a dataFrom option', async () => {
                const options = { dataTo: '2018-12-04', offset: 15 }
                await this.instance.analyses(options).should.be.rejectedWith(TypeError)
              })
            })
          })
        })
      })

      describe('ApiVersion', () => {
        it('should be a function', () => {
          armlet.ApiVersion.should.be.a('function')
        })

        it('should return a thenable', () => {
          const result = armlet.ApiVersion(apiUrl)

          result.then.should.be.a('function')
        })
      })

      describe('OpenApiSpec', () => {
        it('should be a function', () => {
          armlet.OpenApiSpec.should.be.a('function')
        })

        it('should return a thenable', () => {
          const result = armlet.OpenApiSpec(apiUrl)

          result.then.should.be.a('function')
        })
      })
    })
  })

  describe('functionality', () => {
    const uuid = 'analysis-uuid'
    const issues = ['issue1', 'issue2']
    const parsedApiUrl = new url.URL(apiUrl)
    const refreshToken = 'refresh-token'
    const accessToken = 'access-token'

    describe('Client', () => {
      beforeEach(() => {
        this.instance = new Client({ email, ethAddress, userId, password }, apiUrl)
      })

      describe('analyze', () => {
        afterEach(() => {
          requester.do.restore()
          poller.do.restore()
        })

        describe('when the client logs in for the first time', () => {
          afterEach(() => {
            login.do.restore()
          })
          it('should login and chain requester and poller', async () => {
            sinon.stub(login, 'do')
              .withArgs(email, ethAddress, userId, password, parsedApiUrl)
              .returns(new Promise(resolve => {
                resolve({ access: accessToken, refresh: refreshToken })
              }))
            sinon.stub(requester, 'do')
              .withArgs({ data }, accessToken, parsedApiUrl)
              .returns(new Promise(resolve => {
                resolve(uuid)
              }))
            sinon.stub(poller, 'do')
              .withArgs(uuid, accessToken, parsedApiUrl)
              .returns(new Promise(resolve => {
                resolve(issues)
              }))

            await this.instance.analyze({ data }).should.eventually.equal(issues)
          })

          it('should reject with login failures', async () => {
            const errorMsg = 'Booom! from login'
            sinon.stub(login, 'do')
              .withArgs(email, ethAddress, userId, password, parsedApiUrl)
              .returns(new Promise((resolve, reject) => {
                reject(new Error(errorMsg))
              }))
            sinon.stub(requester, 'do')
              .withArgs({ data }, accessToken, parsedApiUrl)
              .returns(new Promise(resolve => {
                resolve(uuid)
              }))
            sinon.stub(poller, 'do')
              .withArgs(uuid, accessToken, parsedApiUrl)
              .returns(new Promise(resolve => {
                resolve(issues)
              }))

            await this.instance.analyze({ data }).should.be.rejectedWith(Error, errorMsg)
          })

          it('should reject with requester failures', async () => {
            const errorMsg = 'Booom! from requester'
            sinon.stub(login, 'do')
              .withArgs(email, ethAddress, userId, password, parsedApiUrl)
              .returns(new Promise(resolve => {
                resolve({ access: accessToken, refresh: refreshToken })
              }))
            sinon.stub(requester, 'do')
              .withArgs({ data }, accessToken, parsedApiUrl)
              .returns(new Promise((resolve, reject) => {
                reject(new Error(errorMsg))
              }))
            sinon.stub(poller, 'do')
              .withArgs(uuid, accessToken, parsedApiUrl)
              .returns(new Promise(resolve => {
                resolve(issues)
              }))

            await this.instance.analyze({ data }).should.be.rejectedWith(Error, errorMsg)
          })

          it('should reject with poller failures', async () => {
            const errorMsg = 'Booom! from poller'
            sinon.stub(login, 'do')
              .withArgs(email, ethAddress, userId, password, parsedApiUrl)
              .returns(new Promise(resolve => {
                resolve({ access: accessToken, refresh: refreshToken })
              }))
            sinon.stub(requester, 'do')
              .withArgs({ data }, accessToken, parsedApiUrl)
              .returns(new Promise(resolve => {
                resolve(uuid)
              }))
            sinon.stub(poller, 'do')
              .withArgs(uuid, accessToken, parsedApiUrl)
              .returns(new Promise((resolve, reject) => {
                reject(new Error(errorMsg))
              }))

            await this.instance.analyze({ data }).should.be.rejectedWith(Error, errorMsg)
          })

          it('should pass timeout option to poller', async () => {
            const timeout = 10
            sinon.stub(login, 'do')
              .withArgs(email, ethAddress, userId, password, parsedApiUrl)
              .returns(new Promise(resolve => {
                resolve({ access: accessToken, refresh: refreshToken })
              }))
            sinon.stub(requester, 'do')
              .withArgs({ data, timeout }, accessToken, parsedApiUrl)
              .returns(new Promise(resolve => {
                resolve(uuid)
              }))
            sinon.stub(poller, 'do')
              .withArgs(uuid, accessToken, parsedApiUrl, undefined, timeout)
              .returns(new Promise(resolve => {
                resolve(issues)
              }))

            await this.instance.analyze({ data, timeout }).should.eventually.equal(issues)
          })
        })

        describe('when the client is already logged in', () => {
          it('should not call login again', async () => {
            this.instance.accessToken = accessToken

            sinon.stub(requester, 'do')
              .withArgs({ data }, accessToken, parsedApiUrl)
              .returns(new Promise(resolve => {
                resolve(uuid)
              }))
            sinon.stub(poller, 'do')
              .withArgs(uuid, accessToken, parsedApiUrl)
              .returns(new Promise(resolve => {
                resolve(issues)
              }))

            await this.instance.analyze({ data }).should.eventually.equal(issues)
          })
        })
      })

      describe('refresh', () => {
        const newAccessToken = 'newAccessToken'
        const newRefreshToken = 'newRefreshToken'

        beforeEach(() => {
          this.instance.accessToken = accessToken
          this.instance.refreshToken = refreshToken
        })

        afterEach(() => {
          refresh.do.restore()
          requester.do.restore()
          poller.do.restore()
        })

        it('should refresh expired tokens when requester fails', async () => {
          const requesterStub = sinon.stub(requester, 'do')
          requesterStub.withArgs({ data }, accessToken, parsedApiUrl)
            .returns(new Promise((resolve, reject) => {
              reject(HttpErrors.Unauthorized())
            }))
          requesterStub.withArgs({ data }, newAccessToken, parsedApiUrl)
            .returns(new Promise(resolve => {
              resolve(uuid)
            }))

          sinon.stub(refresh, 'do')
            .withArgs(accessToken, refreshToken, parsedApiUrl)
            .returns(new Promise(resolve => {
              resolve({ access: newAccessToken, refresh: newRefreshToken })
            }))

          sinon.stub(poller, 'do')
            .withArgs(uuid, newAccessToken, parsedApiUrl)
            .returns(new Promise(resolve => {
              resolve(issues)
            }))

          await this.instance.analyze({ data }).should.eventually.equal(issues)
        })

        it('should refresh expired tokens when poller fails', async () => {
          const pollerStub = sinon.stub(poller, 'do')
          pollerStub.withArgs(uuid, accessToken, parsedApiUrl)
            .returns(new Promise((resolve, reject) => {
              reject(HttpErrors.Unauthorized())
            }))
          pollerStub.withArgs(uuid, newAccessToken, parsedApiUrl)
            .returns(new Promise(resolve => {
              resolve(issues)
            }))

          sinon.stub(requester, 'do')
            .withArgs({ data }, accessToken, parsedApiUrl)
            .returns(new Promise(resolve => {
              resolve(uuid)
            }))

          sinon.stub(refresh, 'do')
            .withArgs(accessToken, refreshToken, parsedApiUrl)
            .returns(new Promise(resolve => {
              resolve({ access: newAccessToken, refresh: newRefreshToken })
            }))

          await this.instance.analyze({ data }).should.eventually.equal(issues)
        })
      })

      describe('analyses', () => {
        const dateFrom = '2018-11-24'
        const dateTo = '2018-11-25'
        const offset = 5
        const baseUrl = `${apiUrl}/${armlet.defaultApiVersion}/analyses`
        const url = `${baseUrl}?dateFrom=${dateFrom}&dateTo=${dateTo}&offset=${offset}`
        const analyses = ['analysis1', 'analysis2']

        describe('when the client logs in for the first time', () => {
          afterEach(() => {
            login.do.restore()
            simpleRequester.do.restore()
          })

          it('should login and call simpleRequester', async () => {
            sinon.stub(login, 'do')
              .withArgs(email, ethAddress, password, parsedApiUrl)
              .returns(new Promise(resolve => {
                resolve({ access: accessToken, refresh: refreshToken })
              }))
            sinon.stub(simpleRequester, 'do')
              .withArgs({ url, accessToken, json: true })
              .returns(new Promise(resolve => {
                resolve(analyses)
              }))

            await this.instance.analyses({ dateFrom, dateTo, offset }).should.eventually.equal(analyses)
          })

          it('should reject with login failures', async () => {
            const errorMsg = 'Booom! from login'
            sinon.stub(login, 'do')
              .withArgs(email, ethAddress, password, parsedApiUrl)
              .returns(new Promise((resolve, reject) => {
                reject(new Error(errorMsg))
              }))
            sinon.stub(simpleRequester, 'do')
              .withArgs({ url, accessToken, json: true })
              .returns(new Promise(resolve => {
                resolve(analyses)
              }))

            await this.instance.analyses({ dateFrom, dateTo, offset }).should.be.rejectedWith(Error, errorMsg)
          })

          it('should reject with simpleRequester failures', async () => {
            const errorMsg = 'Booom! from simpleRequester'
            sinon.stub(login, 'do')
              .withArgs(email, ethAddress, password, parsedApiUrl)
              .returns(new Promise(resolve => {
                resolve({ access: accessToken, refresh: refreshToken })
              }))
            sinon.stub(simpleRequester, 'do')
              .withArgs({ url, accessToken, json: true })
              .returns(new Promise((resolve, reject) => {
                reject(new Error(errorMsg))
              }))

            await this.instance.analyses({ dateFrom, dateTo, offset }).should.be.rejectedWith(Error, errorMsg)
          })
        })

        describe('when the client is already logged in', () => {
          afterEach(() => {
            simpleRequester.do.restore()
          })

          it('should not call login again', async () => {
            this.instance.accessToken = accessToken

            sinon.stub(simpleRequester, 'do')
              .withArgs({ url, accessToken, json: true })
              .returns(new Promise(resolve => {
                resolve(analyses)
              }))

            await this.instance.analyses({ dateFrom, dateTo, offset }).should.eventually.equal(analyses)
          })
        })
        describe('refresh', () => {
          const newAccessToken = 'newAccessToken'
          const newRefreshToken = 'newRefreshToken'

          beforeEach(() => {
            this.instance.accessToken = accessToken
            this.instance.refreshToken = refreshToken
          })

          afterEach(() => {
            refresh.do.restore()
            simpleRequester.do.restore()
          })

          it('should refresh expired tokens when simpleRequester fails', async () => {
            const requesterStub = sinon.stub(simpleRequester, 'do')
            requesterStub.withArgs({ url, accessToken, json: true })
              .returns(new Promise((resolve, reject) => {
                reject(HttpErrors.Unauthorized())
              }))
            requesterStub.withArgs({ url, accessToken: newAccessToken, json: true })
              .returns(new Promise(resolve => {
                resolve(analyses)
              }))

            sinon.stub(refresh, 'do')
              .withArgs(accessToken, refreshToken, parsedApiUrl)
              .returns(new Promise(resolve => {
                resolve({ access: newAccessToken, refresh: newRefreshToken })
              }))

            await this.instance.analyses({ dateFrom, dateTo, offset }).should.eventually.equal(analyses)
          })
        })
      })
    })

    describe('ApiVersion', () => {
      const url = `${apiUrl}/${armlet.defaultApiVersion}/version`
      afterEach(() => {
        simpleRequester.do.restore()
      })

      it('should use simpleRequester', async () => {
        const result = { result: 'result' }

        sinon.stub(simpleRequester, 'do')
          .withArgs({ url, json: true })
          .returns(new Promise(resolve => {
            resolve(result)
          }))

        await armlet.ApiVersion(apiUrl).should.eventually.equal(result)
      })

      it('should reject with simpleRequester failures', async () => {
        const errorMsg = 'Booom!'
        sinon.stub(simpleRequester, 'do')
          .withArgs({ url, json: true })
          .returns(new Promise((resolve, reject) => {
            reject(new Error(errorMsg))
          }))

        await armlet.ApiVersion(apiUrl).should.be.rejectedWith(Error, errorMsg)
      })
    })

    describe('OpenApiSpec', () => {
      const url = `${apiUrl}/${armlet.defaultApiVersion}/openapi.yaml`

      afterEach(() => {
        simpleRequester.do.restore()
      })

      it('should use simpleRequester', async () => {
        const result = 'result'

        sinon.stub(simpleRequester, 'do')
          .withArgs({ url })
          .returns(new Promise(resolve => {
            resolve(result)
          }))

        await armlet.OpenApiSpec(apiUrl).should.eventually.equal(result)
      })

      it('should reject with simpleRequester failures', async () => {
        const errorMsg = 'Booom!'
        sinon.stub(simpleRequester, 'do')
          .withArgs({ url })
          .returns(new Promise((resolve, reject) => {
            reject(new Error(errorMsg))
          }))

        await armlet.OpenApiSpec(apiUrl).should.be.rejectedWith(Error, errorMsg)
      })
    })
  })
})
