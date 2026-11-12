# Architecture

User text → bounded server input → lexical retrieval → provider selection → trusted reviewed materialization. Existing optional preview stays loopback; proposed external HTTPS gateway authenticates before any paid call. Cookie/session, origin and cost limits are independent controls. The gateway must reject direct access to the backend, preserve required host/origin semantics and never log prompts or secrets. This is an unimplemented design, not an authorization to expose a service.
