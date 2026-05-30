# Extension Points Registry

> Review this file every sprint planning session.
> Source: context/00_master_construction_os.md §EXTENSION POINT PROTOCOL

## Status legend
- `STUB` — stub class created, not yet implemented
- `RESOLVED` — fully implemented
- `CLOSED` — not needed (see note)

| EP ID | Name | Status | Version | Phase | Trigger | File |
|-------|------|--------|---------|-------|---------|------|
| EP-API-001 | APIMonetizationProvider | STUB | 0.1.0 | Phase 5+ | First API-as-a-product customer or marketplace launch | — |
| EP-AUTH-001 | AdvancedABACPolicy | STUB | 0.1.0 | Phase 2 | Enterprise customer requires custom attribute rules | — |
| EP-AUTH-002 | SMSOTPProvider | RESOLVED | 1.0.0 | Phase 2 | AWS SNS selected | identity module |
| EP-AUTH-003 | EnterpriseSSOProvider | STUB | 0.1.0 | Phase 2 | Enterprise customer with existing IdP | Keycloak config |
| EP-TENANT-003 | DedicatedDBIsolation | STUB | 0.1.0 | Post-MVP | ENTERPRISE plan + dedicated DB request | — |
| EP-FINANCE-001 | TaxCalculation (Avalara) | STUB | 0.1.0 | Phase 5 | Invoice creation / PO generation | — |
| EP-FINANCE-001-WHT | WithholdingTaxRules | STUB | 0.1.0 | Phase 5 | WHT jurisdiction requirement | — |
| EP-FINANCE-002 | ERPIntegration | STUB | 0.1.0 | Post-MVP | Tenant has existing ERP | — |
| EP-FINANCE-003 | CurrencyExchange (OXR) | STUB | 0.1.0 | Phase 7 | Multi-currency conversion needed | — |
| EP-PROC-001 | VendorScoring | STUB | 0.1.0 | Phase 5 | Methodology defined by product owner | — |
| EP-AI-001 | LLMProvider (OpenAI) | STUB | 0.1.0 | Phase 11 | AI Gateway activation | ai-gateway |
| EP-AI-002 | CrossEncoderReranking | STUB | 0.1.0 | Phase 12 | RAG retrieval quality insufficient | — |
| EP-AI-003 | CloudOCRProvider | STUB | 0.1.0 | Phase 11 | Invoice photo OCR pipeline activation | — |
| EP-AI-004 | ModelRegistry (MLflow) | STUB | 0.1.0 | Phase 23 | MLflow server running | — |
| EP-AI-005 | FeatureStore (Feast) | STUB | 0.1.0 | Phase 23 | Feast configured | — |
| EP-AI-006 | AutonomousWorkflowExecutor | STUB | 0.1.0 | Phase 23+ | Governance review complete | — |
| EP-AI-007 | ExperimentMonitoring (W&B) | STUB | 0.1.0 | Phase 23 | W&B decision (self-hosted vs cloud) | — |
| EP-AI-008 | DelayForecastModel | STUB | 0.1.0 | Phase 23 | 90+ days production data | — |
| EP-AI-009 | SafetyVisionModel | STUB | 0.1.0 | Phase 23 | 10,000+ labeled site photos | — |
| EP-AI-010 | GraphMLModel | STUB | 0.1.0 | Phase 23 | 6+ months Neo4j relationship data | — |
| EP-AI-011 | RiskClassifier | STUB | 0.1.0 | Phase 23 | 50+ projects with full lifecycle | — |
| EP-AI-012 | EmbeddingProvider (OpenAI) | STUB | 0.1.0 | Phase 11 | Embedding worker activation | ai-embedding-worker |
| EP-AI-013 | LangChainProviderConfig | STUB | 0.1.0 | Phase 11 | LangChain integration | ai-gateway |
| EP-AI-014 | AlternativeLLMProvider | STUB | 0.1.0 | Phase 11 | LLM swap needed | ai-gateway |
| EP-INFRA-002 | SecretRotation (Vault) | STUB | 0.1.0 | Phase 17 | Security audit rotation requirement | infra/terraform |
| EP-INFRA-003 | MultiRegionDeploy | STUB | 0.1.0 | Phase 17 | First tenant with data residency req | infra/terraform |
| EP-INFRA-004 | EmailProvider (SendGrid→SES) | STUB | 0.1.0 | Phase 20 | Notification service activation | notification module |
| EP-INFRA-005 | DebeziumCDCPipeline | STUB | 0.1.0 | Phase 17 | Data lake infrastructure ready | infra/kafka |
| EP-WAF-001 | CloudflareWAFIntegration | RESOLVED | 1.0.0 | Phase 16 | Cloudflare WAF selected 2026-05-26 | packages/@cos/extension-points |
| EP-ENV-001 | CarbonCalculationEngine | STUB | 0.1.0 | Phase 6 | Carbon reporting requirement | — |
| EP-DOMAIN-001 | CRMIntegration | STUB | 0.1.0 | Phase 3 | Sales team CRM integration | — |
| EP-DOMAIN-002 | BIMIntegration | STUB | 0.1.0 | Phase 3/4 | BIM software adoption | — |
| EP-DOMAIN-003 | IoTIntegration | STUB | 0.1.0 | Phase 21 | GPS-tracked equipment | — |
| EP-DOMAIN-005 | ConstructionFinancing | STUB | 0.1.0 | Phase 7 | Invoice factoring need | — |
| EP-DOMAIN-006 | LINENotification | STUB | 0.1.0 | Phase 20 | Thai market LINE integration | — |
| EP-DOMAIN-008 | BiometricCheckIn | STUB | 0.1.0 | Phase 2/22 | Hardware biometric at site gate | — |
| EP-MOBILE-002 | ExecMobileScreens | RESOLVED | 1.0.0 | Phase 10 | All-role mobile confirmed | apps/mobile |
| EP-MOBILE-003 | FinanceMobileScreens | RESOLVED | 1.0.0 | Phase 10 | All-role mobile confirmed | apps/mobile |
| EP-MOBILE-004 | ProcurementMobileScreens | RESOLVED | 1.0.0 | Phase 10 | All-role mobile confirmed | apps/mobile |
| EP-DESIGN-001 | WebTypographyTokens | RESOLVED | 1.0.0 | Phase 1 | Inter Tight 14px base | packages/@cos/types |
| EP-DESIGN-002 | WebSpacingTokens | RESOLVED | 1.0.0 | Phase 1 | 4px base grid | packages/@cos/types |
| EP-DESIGN-003 | ReactNativeDarkMode | RESOLVED | 1.0.0 | Phase 10 | Expo dark theme | apps/mobile |
| EP-DESIGN-004 | PWADesignTokens | CLOSED | — | — | PWA shares web CSS tokens (no-op) | — |
| EP-COMPLIANCE-001 | ComplianceAuditWorkflow | STUB | 0.1.0 | Phase 16 | 6 months before certification date | — |
