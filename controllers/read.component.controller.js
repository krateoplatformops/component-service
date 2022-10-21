const express = require('express')
const router = express.Router()
const logger = require('../service-library/helpers/logger.helpers')
const k8s = require('@kubernetes/client-node')
const axios = require('axios')
const k8sHelpers = require('../service-library/helpers/k8s.helpers')

router.get('/', async (req, res, next) => {
  try {
    k8sHelpers.init()

    logger.debug(`namespace: ${process.env.NAMESPACE}`)

    logger.debug(
      `KUBERNETES_SERVICE_PORT: ${process.env.KUBERNETES_SERVICE_PORT}`
    )

    const kc = new k8s.KubeConfig()
    kc.loadFromDefault()
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api)

    const components = await k8sApi
      .listNamespacedService(process.env.NAMESPACE)
      .then((response) => {
        return response.body.items
      })
      .catch(() => {
        logger.error('Cannot get services')
        return null
      })

    logger.debug(components)

    if (!components) {
      return res.status(500).json({ message: 'Error on reading components' })
    }

    const content = await Promise.all(
      (components || []).map(async (v) => {
        const url = `http://${v.metadata.name}.${process.env.NAMESPACE}.svc:${v.spec.ports[0].port}/healthz`
        const payload = {
          name: v.metadata.name
        }
        return axios
          .get(url)
          .then((result) => {
            if (result.data.name) {
              payload.name = result.data.name
              payload.version = result.data.version
            }
            payload.status = result.status
            payload.statusText = result.statusText
            return payload
          })
          .catch((err) => {
            try {
              payload.status = err.response.status
              payload.statusText = err.response.statusText
            } catch {
              payload.status = 500
              payload.statusText = err.code
            }
            return payload
          })
      })
    )

    const ids = content.map((o) => o.name)

    res.status(200).json({
      list: content.filter(({ name }, index) => !ids.includes(name, index + 1))
    })
  } catch (error) {
    next(error)
  }
})

module.exports = router
