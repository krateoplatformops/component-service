const express = require('express')
const router = express.Router()
const logger = require('../service-library/helpers/logger.helpers')
const k8s = require('@kubernetes/client-node')
const axios = require('axios')

router.get('/', async (req, res, next) => {
  try {
    logger.debug(`namespace: ${process.env.NAMESPACE}`)

    const kc = new k8s.KubeConfig()
    kc.loadFromDefault()
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api)

    const components = await k8sApi
      .listNamespacedService(process.env.NAMESPACE)
      .then((response) => {
        return response.body.items
      })
      .catch((err) => {
        logger.error(err)
        return err
      })

    const content = await Promise.all(
      components.map(async (v) => {
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

    res.status(200).json({ list: content.filter((x) => x.status === 200) })
  } catch (error) {
    next(error)
  }
})

module.exports = router
