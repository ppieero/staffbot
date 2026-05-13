"use client";
import { useEffect, useState } from "react";

const STORAGE_KEY = "staffbot_lang";
const LANG_EVENT  = "staffbot_lang_change";

export type Lang = "es" | "en" | "fr" | "pt";

const translations: Record<Lang, Record<string, string>> = {
  es: {
    // ── Nav ──────────────────────────────────────────────────────────────────
    "nav.dashboard":      "Dashboard",
    "nav.companies":      "Empresas",
    "nav.profiles":       "Perfiles",
    "nav.employees":      "Empleados",
    "nav.conversations":  "Conversaciones",
    "nav.documents":      "Documentos",
    "nav.tokens":         "Tokens",
    "nav.settings":       "Configuración",
    "nav.manuals":        "Manuales",
    "nav.integrations":   "Integraciones",
    "nav.signout":        "Cerrar sesión",
    "nav.viewingAs":      "Viendo como",
    "nav.returnAdmin":    "Volver al Super Admin",

    // ── Manuals ───────────────────────────────────────────────────────────────
    "manuals.title":    "Manuales",
    "manuals.subtitle": "Manuales web generados por IA para tu equipo",

    // ── Image editor ──────────────────────────────────────────────────────────
    "manuals.imgEdit.btn":          "Editar imágenes",
    "manuals.imgEdit.title":        "Editar imágenes por sección",
    "manuals.imgEdit.loading":      "Cargando…",
    "manuals.imgEdit.currentLabel": "Imágenes actuales",
    "manuals.imgEdit.noImages":     "Sin imágenes asignadas a esta sección",
    "manuals.imgEdit.page":         "Página",
    "manuals.imgEdit.availableHint":"Imágenes disponibles del documento — haz clic para agregar (máx. 3 por sección)",
    "manuals.imgEdit.noAvailable":  "Sin imágenes disponibles. Las imágenes se guardan al generar un manual.",
    "manuals.imgEdit.added":        "Agregada",
    "manuals.imgEdit.cancel":       "Cancelar",
    "manuals.imgEdit.save":         "Guardar cambios",
    "manuals.imgEdit.saving":       "Guardando…",
    "manuals.imgEdit.errorLoad":    "Error al cargar las imágenes",
    "manuals.imgEdit.saved":        "Imágenes guardadas",
    "manuals.imgEdit.errorSave":    "Error al guardar las imágenes",

    // ── Settings page ─────────────────────────────────────────────────────────
    "settings.title":    "Configuración",
    "settings.subtitle": "Gestiona tu cuenta y preferencias",
    "settings.saving":   "Guardando…",

    "settings.tab.profile":       "Perfil",
    "settings.tab.preferences":   "Preferencias",
    "settings.tab.notifications": "Notificaciones",
    "settings.tab.integrations":  "Integraciones",
    "settings.tab.audit":         "Auditoría",

    "settings.saved":         "Configuración guardada",
    "settings.saveFailed":    "Error al guardar",
    "settings.pwMismatch":    "Las contraseñas no coinciden",
    "settings.pwTooShort":    "La contraseña debe tener mínimo 8 caracteres",
    "settings.pwChanged":     "Contraseña cambiada",
    "settings.pwChangeFailed":"Error al cambiar contraseña",

    "settings.profile.section":   "Información personal",
    "settings.profile.firstName": "Nombre",
    "settings.profile.lastName":  "Apellido",
    "settings.profile.email":     "Email",
    "settings.profile.emailHint": "(contacta a tu admin para cambiar)",
    "settings.profile.role":      "Rol",
    "settings.profile.save":      "Guardar perfil",

    "settings.password.section": "Cambiar contraseña",
    "settings.password.current": "Contraseña actual",
    "settings.password.new":     "Nueva contraseña",
    "settings.password.newHint": "(mín. 8 caracteres)",
    "settings.password.confirm": "Confirmar nueva contraseña",
    "settings.password.change":  "Cambiar contraseña",

    "settings.prefs.section":  "Preferencias del dashboard",
    "settings.prefs.language": "Idioma",
    "settings.prefs.timezone": "Zona horaria",
    "settings.prefs.save":     "Guardar preferencias",

    "settings.notif.channels":         "Canales de notificación",
    "settings.notif.channelsHint":     "Recibe alertas en WhatsApp o Telegram cuando ocurran eventos importantes.",
    "settings.notif.whatsapp":         "Número de WhatsApp",
    "settings.notif.whatsappHint":     "(para notificaciones)",
    "settings.notif.telegram":         "ID de Telegram",
    "settings.notif.telegramHint":     "(usuario o numérico)",
    "settings.notif.events":           "Eventos de notificación",
    "settings.notif.escalations":      "Conversaciones escaladas",
    "settings.notif.escalationsHint":  "Alerta cuando se escala una conversación a RRHH",
    "settings.notif.newEmployees":     "Nuevo empleado registrado",
    "settings.notif.newEmployeesHint": "Alerta cuando se agrega un nuevo empleado a tu empresa",
    "settings.notif.viaWhatsapp":      "Recibir por WhatsApp",
    "settings.notif.viaWhatsappHint":  "Recibe notificaciones en tu número de WhatsApp",
    "settings.notif.viaTelegram":      "Recibir por Telegram",
    "settings.notif.viaTelegramHint":  "Recibe notificaciones en tu cuenta de Telegram",
    "settings.notif.save":             "Guardar notificaciones",

    "settings.integ.notionDesc":     "Importa agendas y documentación desde tu workspace de Notion",
    "settings.integ.connectedLabel": "Conectado —",
    "settings.integ.manageHint":     "Gestiona los recursos sincronizados en la sección de Integraciones",
    "settings.integ.manage":         "Gestionar →",
    "settings.integ.configure":      "Configurar →",
    "settings.integ.notConnectedHint": "Conecta Notion para importar agendas y documentación para tus perfiles",

    "settings.audit.page":   "Página",
    "settings.audit.noLogs": "Sin registros de auditoría",
    "settings.audit.prev":   "← Anterior",
    "settings.audit.next":   "Siguiente →",

    // ── Integraciones setup page ──────────────────────────────────────────────
    "integ.title":    "Integraciones",
    "integ.subtitle": "Conecta herramientas externas para enriquecer las respuestas del bot",
    "integ.back":     "← Configuración",

    "integ.notion.desc":    "Importa agendas, horarios y documentación directamente desde tu workspace",
    "integ.connectedSince": "Conectado el",
    "integ.reconnect":      "Reconectar / más páginas",
    "integ.manage":         "Gestionar recursos →",

    "integ.tipReconnectTitle": "¿Quieres agregar más páginas?",
    "integ.tipReconnectBody":  "Si durante la conexión inicial no seleccionaste todas las páginas que necesitas, haz clic en «Reconectar / más páginas». Notion te mostrará de nuevo la pantalla para seleccionar acceso.",

    "integ.setupHint": "Sigue estos pasos para conectar Notion y que tus empleados puedan consultar agendas y documentación por WhatsApp o Telegram.",

    "integ.step1.title": "Haz clic en «Conectar con Notion»",
    "integ.step1.body":  "Te redirigiremos a Notion para autorizar el acceso. Asegúrate de estar logueado con la cuenta de tu empresa.",

    "integ.step2.title": "Selecciona las páginas y bases de datos en Notion",
    "integ.step2.body":  "Notion mostrará una pantalla donde puedes elegir qué páginas o bases de datos comparte con StaffBot.",
    "integ.step2.tip":   "Selecciona TODAS las páginas y bases de datos que quieras usar — agendas, procedimientos, horarios, etc. Si después necesitas agregar más, usa el botón «Reconectar / más páginas».",

    "integ.step3.title": "Agrega cada recurso y asígnalo a los perfiles correctos",
    "integ.step3.body":  "Después de conectar ve a Integraciones → Notion. Allí puedes agregar páginas/bases de datos y elegir qué perfiles de empleados pueden consultarlas.",
    "integ.step3.tip":   "Ejemplo: la agenda del equipo de ventas solo al perfil «Ventas», los procedimientos de almacén solo a «Almacén».",

    "integ.step4.title": "Listo — el bot ya responde con tu contenido de Notion",
    "integ.step4.body":  "Cuando un empleado haga una pregunta, el bot buscará en los recursos de Notion asignados a su perfil.",

    "integ.connectBtn":    "Conectar con Notion →",
    "integ.connectingBtn": "Redirigiendo a Notion…",

    // ── Notion resource manager ───────────────────────────────────────────────
    "notion.title":              "Integración Notion",
    "notion.subtitle":           "Conecta Notion para importar agendas y documentación",
    "notion.connect":            "Conectar con Notion",
    "notion.disconnect":         "Desconectar",
    "notion.connected":          "Conectado",
    "notion.notConnected":       "No conectado",
    "notion.workspace":          "Workspace",
    "notion.connectedAt":        "Conectado el",
    "notion.browse":             "Explorar workspace",
    "notion.resources":          "Recursos sincronizados",
    "notion.addResource":        "Agregar recurso",
    "notion.sync":               "Sincronizar",
    "notion.delete":             "Eliminar",
    "notion.editProfiles":       "Editar perfiles",
    "notion.category.agenda":    "Agenda",
    "notion.category.document":  "Documento",
    "notion.category.custom":    "Personalizado",
    "notion.type.database":      "Base de datos",
    "notion.type.page":          "Página",
    "notion.status.pending":     "Pendiente",
    "notion.status.syncing":     "Sincronizando",
    "notion.status.synced":      "Sincronizado",
    "notion.status.error":       "Error",
    "notion.lastSynced":         "Última sync",
    "notion.chunks":             "fragmentos",
    "notion.selectProfiles":     "Seleccionar perfiles",
    "notion.noResources":        "Sin recursos agregados",
    "notion.noResourcesHint":    "Conecta Notion y agrega páginas o bases de datos para sincronizar.",
    "notion.confirmDisconnect":  "¿Desconectar Notion? Los recursos sincronizados se conservarán pero no se actualizarán.",
    "notion.confirmDelete":      "¿Eliminar este recurso? Se eliminará del RAG.",
    "notion.resourceCategory":   "Categoría",
    "notion.assignedProfiles":   "Perfiles con acceso",
    "notion.noProfiles":         "Sin perfiles asignados",
    "notion.save":               "Guardar",
    "notion.cancel":             "Cancelar",
    "notion.syncEnqueued":       "Sincronización encolada",
    "notion.connectFirst":       "Conecta tu workspace de Notion primero",

    // ── Profile detail — Notion sources panel ─────────────────────────────────
    "profile.notionSources":     "Fuentes de Notion",
    "profile.notionSourcesHint": "Recursos de Notion asignados a este perfil",
    "profile.noNotionSources":   "Sin recursos de Notion asignados",
    "profile.manageNotion":      "Gestionar en Integraciones →",
  },

  en: {
    // ── Nav ──────────────────────────────────────────────────────────────────
    "nav.dashboard":     "Dashboard",
    "nav.companies":     "Companies",
    "nav.profiles":      "Profiles",
    "nav.employees":     "Employees",
    "nav.conversations": "Conversations",
    "nav.documents":     "Documents",
    "nav.tokens":        "Tokens",
    "nav.settings":      "Settings",
    "nav.manuals":       "Manuals",
    "nav.integrations":  "Integrations",
    "nav.signout":       "Sign out",
    "nav.viewingAs":     "Viewing as",
    "nav.returnAdmin":   "Return to Super Admin",

    // ── Manuals ───────────────────────────────────────────────────────────────
    "manuals.title":    "Manuals",
    "manuals.subtitle": "AI-generated web manuals for your team",

    // ── Image editor ──────────────────────────────────────────────────────────
    "manuals.imgEdit.btn":          "Edit images",
    "manuals.imgEdit.title":        "Edit section images",
    "manuals.imgEdit.loading":      "Loading…",
    "manuals.imgEdit.currentLabel": "Current images",
    "manuals.imgEdit.noImages":     "No images assigned to this section",
    "manuals.imgEdit.page":         "Page",
    "manuals.imgEdit.availableHint":"Available images from document — click to add (max 3 per section)",
    "manuals.imgEdit.noAvailable":  "No available images found. Images are saved when generating a new manual.",
    "manuals.imgEdit.added":        "Added",
    "manuals.imgEdit.cancel":       "Cancel",
    "manuals.imgEdit.save":         "Save changes",
    "manuals.imgEdit.saving":       "Saving…",
    "manuals.imgEdit.errorLoad":    "Error loading manual images",
    "manuals.imgEdit.saved":        "Images saved",
    "manuals.imgEdit.errorSave":    "Error saving images",

    // ── Settings page ─────────────────────────────────────────────────────────
    "settings.title":    "Settings",
    "settings.subtitle": "Manage your account and preferences",
    "settings.saving":   "Saving…",

    "settings.tab.profile":       "Profile",
    "settings.tab.preferences":   "Preferences",
    "settings.tab.notifications": "Notifications",
    "settings.tab.integrations":  "Integrations",
    "settings.tab.audit":         "Audit Log",

    "settings.saved":          "Settings saved",
    "settings.saveFailed":     "Save failed",
    "settings.pwMismatch":     "New passwords don't match",
    "settings.pwTooShort":     "Password must be at least 8 characters",
    "settings.pwChanged":      "Password changed",
    "settings.pwChangeFailed": "Password change failed",

    "settings.profile.section":   "Personal Information",
    "settings.profile.firstName": "First Name",
    "settings.profile.lastName":  "Last Name",
    "settings.profile.email":     "Email",
    "settings.profile.emailHint": "(contact your admin to change)",
    "settings.profile.role":      "Role",
    "settings.profile.save":      "Save Profile",

    "settings.password.section": "Change Password",
    "settings.password.current": "Current Password",
    "settings.password.new":     "New Password",
    "settings.password.newHint": "(min 8 chars)",
    "settings.password.confirm": "Confirm New Password",
    "settings.password.change":  "Change Password",

    "settings.prefs.section":  "Dashboard Preferences",
    "settings.prefs.language": "Language",
    "settings.prefs.timezone": "Timezone",
    "settings.prefs.save":     "Save Preferences",

    "settings.notif.channels":         "Notification Channels",
    "settings.notif.channelsHint":     "Receive alerts on WhatsApp or Telegram when important events happen.",
    "settings.notif.whatsapp":         "WhatsApp Number",
    "settings.notif.whatsappHint":     "(for notifications)",
    "settings.notif.telegram":         "Telegram ID",
    "settings.notif.telegramHint":     "(username or numeric)",
    "settings.notif.events":           "Notification Events",
    "settings.notif.escalations":      "Escalated Conversations",
    "settings.notif.escalationsHint":  "Alert when an employee conversation is escalated to HR",
    "settings.notif.newEmployees":     "New Employee Registered",
    "settings.notif.newEmployeesHint": "Alert when a new employee is added to your company",
    "settings.notif.viaWhatsapp":      "Send via WhatsApp",
    "settings.notif.viaWhatsappHint":  "Receive notifications on your WhatsApp number",
    "settings.notif.viaTelegram":      "Send via Telegram",
    "settings.notif.viaTelegramHint":  "Receive notifications on your Telegram account",
    "settings.notif.save":             "Save Notifications",

    "settings.integ.notionDesc":       "Import agendas and documentation from your Notion workspace",
    "settings.integ.connectedLabel":   "Connected —",
    "settings.integ.manageHint":       "Manage synced resources in the Integrations section",
    "settings.integ.manage":           "Manage →",
    "settings.integ.configure":        "Configure →",
    "settings.integ.notConnectedHint": "Connect Notion to import agendas and documentation for your profiles",

    "settings.audit.page":   "Page",
    "settings.audit.noLogs": "No audit logs yet",
    "settings.audit.prev":   "← Prev",
    "settings.audit.next":   "Next →",

    // ── Integraciones setup page ──────────────────────────────────────────────
    "integ.title":    "Integrations",
    "integ.subtitle": "Connect external tools to enrich bot responses",
    "integ.back":     "← Settings",

    "integ.notion.desc":    "Import agendas, schedules and documentation directly from your workspace",
    "integ.connectedSince": "Connected on",
    "integ.reconnect":      "Reconnect / more pages",
    "integ.manage":         "Manage resources →",

    "integ.tipReconnectTitle": "Want to add more pages?",
    "integ.tipReconnectBody":  "If you didn't select all pages during the initial connection, click «Reconnect / more pages». Notion will show the access selection screen again.",

    "integ.setupHint": "Follow these steps to connect Notion so your employees can query agendas and documentation via WhatsApp or Telegram.",

    "integ.step1.title": "Click «Connect with Notion»",
    "integ.step1.body":  "We'll redirect you to Notion to authorize access. Make sure you're logged in with your company account.",

    "integ.step2.title": "Select pages and databases in Notion",
    "integ.step2.body":  "Notion will show a screen where you can choose which pages or databases to share with StaffBot.",
    "integ.step2.tip":   "Select ALL pages and databases you want to use — agendas, procedures, schedules, etc. If you need to add more later, use the «Reconnect / more pages» button.",

    "integ.step3.title": "Add each resource and assign it to the right profiles",
    "integ.step3.body":  "After connecting, go to Integrations → Notion. There you can add pages/databases and choose which employee profiles can consult them.",
    "integ.step3.tip":   "Example: the sales team agenda only to the «Sales» profile, warehouse procedures only to «Warehouse».",

    "integ.step4.title": "Done — the bot already responds with your Notion content",
    "integ.step4.body":  "When an employee asks a question, the bot will search in the Notion resources assigned to their profile.",

    "integ.connectBtn":    "Connect with Notion →",
    "integ.connectingBtn": "Redirecting to Notion…",

    // ── Notion resource manager ───────────────────────────────────────────────
    "notion.title":             "Notion Integration",
    "notion.subtitle":          "Connect Notion to import schedules and documentation",
    "notion.connect":           "Connect with Notion",
    "notion.disconnect":        "Disconnect",
    "notion.connected":         "Connected",
    "notion.notConnected":      "Not connected",
    "notion.workspace":         "Workspace",
    "notion.connectedAt":       "Connected on",
    "notion.browse":            "Browse workspace",
    "notion.resources":         "Synced resources",
    "notion.addResource":       "Add resource",
    "notion.sync":              "Sync",
    "notion.delete":            "Delete",
    "notion.editProfiles":      "Edit profiles",
    "notion.category.agenda":   "Agenda",
    "notion.category.document": "Document",
    "notion.category.custom":   "Custom",
    "notion.type.database":     "Database",
    "notion.type.page":         "Page",
    "notion.status.pending":    "Pending",
    "notion.status.syncing":    "Syncing",
    "notion.status.synced":     "Synced",
    "notion.status.error":      "Error",
    "notion.lastSynced":        "Last synced",
    "notion.chunks":            "chunks",
    "notion.selectProfiles":    "Select profiles",
    "notion.noResources":       "No resources added",
    "notion.noResourcesHint":   "Connect Notion and add pages or databases to sync.",
    "notion.confirmDisconnect": "Disconnect Notion? Synced resources will be kept but won't update.",
    "notion.confirmDelete":     "Delete this resource? It will be removed from the RAG.",
    "notion.resourceCategory":  "Category",
    "notion.assignedProfiles":  "Profiles with access",
    "notion.noProfiles":        "No profiles assigned",
    "notion.save":              "Save",
    "notion.cancel":            "Cancel",
    "notion.syncEnqueued":      "Sync enqueued",
    "notion.connectFirst":      "Connect your Notion workspace first",

    // ── Profile detail — Notion sources panel ─────────────────────────────────
    "profile.notionSources":     "Notion Sources",
    "profile.notionSourcesHint": "Notion resources assigned to this profile",
    "profile.noNotionSources":   "No Notion resources assigned",
    "profile.manageNotion":      "Manage in Integrations →",
  },

  fr: {
    // ── Nav ──────────────────────────────────────────────────────────────────
    "nav.dashboard":     "Tableau de bord",
    "nav.companies":     "Entreprises",
    "nav.profiles":      "Profils",
    "nav.employees":     "Employés",
    "nav.conversations": "Conversations",
    "nav.documents":     "Documents",
    "nav.tokens":        "Tokens",
    "nav.settings":      "Paramètres",
    "nav.manuals":       "Manuels",
    "nav.integrations":  "Intégrations",
    "nav.signout":       "Se déconnecter",
    "nav.viewingAs":     "Vue en tant que",
    "nav.returnAdmin":   "Retour au Super Admin",

    // ── Manuals ───────────────────────────────────────────────────────────────
    "manuals.title":    "Manuels",
    "manuals.subtitle": "Manuels web générés par IA pour votre équipe",

    // ── Image editor ──────────────────────────────────────────────────────────
    "manuals.imgEdit.btn":          "Modifier les images",
    "manuals.imgEdit.title":        "Modifier les images par section",
    "manuals.imgEdit.loading":      "Chargement…",
    "manuals.imgEdit.currentLabel": "Images actuelles",
    "manuals.imgEdit.noImages":     "Aucune image assignée à cette section",
    "manuals.imgEdit.page":         "Page",
    "manuals.imgEdit.availableHint":"Images disponibles du document — cliquez pour ajouter (max 3 par section)",
    "manuals.imgEdit.noAvailable":  "Aucune image disponible. Les images sont sauvegardées lors de la génération.",
    "manuals.imgEdit.added":        "Ajoutée",
    "manuals.imgEdit.cancel":       "Annuler",
    "manuals.imgEdit.save":         "Enregistrer",
    "manuals.imgEdit.saving":       "Enregistrement…",
    "manuals.imgEdit.errorLoad":    "Erreur lors du chargement des images",
    "manuals.imgEdit.saved":        "Images enregistrées",
    "manuals.imgEdit.errorSave":    "Erreur lors de l'enregistrement",

    // ── Settings page ─────────────────────────────────────────────────────────
    "settings.title":    "Paramètres",
    "settings.subtitle": "Gérez votre compte et vos préférences",
    "settings.saving":   "Enregistrement…",

    "settings.tab.profile":       "Profil",
    "settings.tab.preferences":   "Préférences",
    "settings.tab.notifications": "Notifications",
    "settings.tab.integrations":  "Intégrations",
    "settings.tab.audit":         "Journal d'audit",

    "settings.saved":          "Paramètres enregistrés",
    "settings.saveFailed":     "Échec de l'enregistrement",
    "settings.pwMismatch":     "Les mots de passe ne correspondent pas",
    "settings.pwTooShort":     "Le mot de passe doit comporter au moins 8 caractères",
    "settings.pwChanged":      "Mot de passe modifié",
    "settings.pwChangeFailed": "Échec du changement de mot de passe",

    "settings.profile.section":   "Informations personnelles",
    "settings.profile.firstName": "Prénom",
    "settings.profile.lastName":  "Nom",
    "settings.profile.email":     "E-mail",
    "settings.profile.emailHint": "(contactez votre admin pour modifier)",
    "settings.profile.role":      "Rôle",
    "settings.profile.save":      "Enregistrer le profil",

    "settings.password.section": "Changer le mot de passe",
    "settings.password.current": "Mot de passe actuel",
    "settings.password.new":     "Nouveau mot de passe",
    "settings.password.newHint": "(min. 8 caractères)",
    "settings.password.confirm": "Confirmer le mot de passe",
    "settings.password.change":  "Changer le mot de passe",

    "settings.prefs.section":  "Préférences du tableau de bord",
    "settings.prefs.language": "Langue",
    "settings.prefs.timezone": "Fuseau horaire",
    "settings.prefs.save":     "Enregistrer les préférences",

    "settings.notif.channels":         "Canaux de notification",
    "settings.notif.channelsHint":     "Recevez des alertes sur WhatsApp ou Telegram lors d'événements importants.",
    "settings.notif.whatsapp":         "Numéro WhatsApp",
    "settings.notif.whatsappHint":     "(pour les notifications)",
    "settings.notif.telegram":         "ID Telegram",
    "settings.notif.telegramHint":     "(nom d'utilisateur ou numérique)",
    "settings.notif.events":           "Événements de notification",
    "settings.notif.escalations":      "Conversations escaladées",
    "settings.notif.escalationsHint":  "Alerte lors de l'escalade d'une conversation vers RH",
    "settings.notif.newEmployees":     "Nouvel employé enregistré",
    "settings.notif.newEmployeesHint": "Alerte lors de l'ajout d'un nouvel employé",
    "settings.notif.viaWhatsapp":      "Recevoir par WhatsApp",
    "settings.notif.viaWhatsappHint":  "Recevez des notifications sur votre numéro WhatsApp",
    "settings.notif.viaTelegram":      "Recevoir par Telegram",
    "settings.notif.viaTelegramHint":  "Recevez des notifications sur votre compte Telegram",
    "settings.notif.save":             "Enregistrer les notifications",

    "settings.integ.notionDesc":       "Importez agendas et documentation depuis votre espace Notion",
    "settings.integ.connectedLabel":   "Connecté —",
    "settings.integ.manageHint":       "Gérez les ressources synchronisées dans la section Intégrations",
    "settings.integ.manage":           "Gérer →",
    "settings.integ.configure":        "Configurer →",
    "settings.integ.notConnectedHint": "Connectez Notion pour importer agendas et documentation pour vos profils",

    "settings.audit.page":   "Page",
    "settings.audit.noLogs": "Aucun journal d'audit",
    "settings.audit.prev":   "← Précédent",
    "settings.audit.next":   "Suivant →",

    // ── Integraciones setup page ──────────────────────────────────────────────
    "integ.title":    "Intégrations",
    "integ.subtitle": "Connectez des outils externes pour enrichir les réponses du bot",
    "integ.back":     "← Paramètres",

    "integ.notion.desc":    "Importez agendas, horaires et documentation directement depuis votre espace",
    "integ.connectedSince": "Connecté le",
    "integ.reconnect":      "Reconnecter / plus de pages",
    "integ.manage":         "Gérer les ressources →",

    "integ.tipReconnectTitle": "Vous souhaitez ajouter plus de pages ?",
    "integ.tipReconnectBody":  "Si vous n'avez pas sélectionné toutes les pages lors de la connexion initiale, cliquez sur «Reconnecter / plus de pages». Notion affichera à nouveau l'écran de sélection d'accès.",

    "integ.setupHint": "Suivez ces étapes pour connecter Notion et permettre à vos employés de consulter agendas et documentation via WhatsApp ou Telegram.",

    "integ.step1.title": "Cliquez sur «Connecter avec Notion»",
    "integ.step1.body":  "Nous vous redirigerons vers Notion pour autoriser l'accès. Assurez-vous d'être connecté avec le compte de votre entreprise.",

    "integ.step2.title": "Sélectionnez les pages et bases de données dans Notion",
    "integ.step2.body":  "Notion affichera un écran où vous pourrez choisir quelles pages ou bases de données partager avec StaffBot.",
    "integ.step2.tip":   "Sélectionnez TOUTES les pages et bases de données à utiliser — agendas, procédures, horaires, etc. Si vous souhaitez en ajouter plus tard, utilisez le bouton «Reconnecter / plus de pages».",

    "integ.step3.title": "Ajoutez chaque ressource et assignez-la aux bons profils",
    "integ.step3.body":  "Après la connexion, allez dans Intégrations → Notion. Vous pouvez y ajouter des pages/bases de données et choisir quels profils d'employés peuvent les consulter.",
    "integ.step3.tip":   "Exemple : l'agenda de l'équipe commerciale uniquement au profil «Ventes», les procédures d'entrepôt uniquement à «Entrepôt».",

    "integ.step4.title": "Terminé — le bot répond désormais avec votre contenu Notion",
    "integ.step4.body":  "Lorsqu'un employé pose une question, le bot recherchera dans les ressources Notion assignées à son profil.",

    "integ.connectBtn":    "Connecter avec Notion →",
    "integ.connectingBtn": "Redirection vers Notion…",

    // ── Notion resource manager ───────────────────────────────────────────────
    "notion.title":             "Intégration Notion",
    "notion.subtitle":          "Connectez Notion pour importer agendas et documentation",
    "notion.connect":           "Connecter avec Notion",
    "notion.disconnect":        "Déconnecter",
    "notion.connected":         "Connecté",
    "notion.notConnected":      "Non connecté",
    "notion.workspace":         "Espace de travail",
    "notion.connectedAt":       "Connecté le",
    "notion.browse":            "Parcourir l'espace",
    "notion.resources":         "Ressources synchronisées",
    "notion.addResource":       "Ajouter une ressource",
    "notion.sync":              "Synchroniser",
    "notion.delete":            "Supprimer",
    "notion.editProfiles":      "Modifier les profils",
    "notion.category.agenda":   "Agenda",
    "notion.category.document": "Document",
    "notion.category.custom":   "Personnalisé",
    "notion.type.database":     "Base de données",
    "notion.type.page":         "Page",
    "notion.status.pending":    "En attente",
    "notion.status.syncing":    "Synchronisation",
    "notion.status.synced":     "Synchronisé",
    "notion.status.error":      "Erreur",
    "notion.lastSynced":        "Dernière sync",
    "notion.chunks":            "fragments",
    "notion.selectProfiles":    "Sélectionner les profils",
    "notion.noResources":       "Aucune ressource ajoutée",
    "notion.noResourcesHint":   "Connectez Notion et ajoutez des pages ou bases de données.",
    "notion.confirmDisconnect": "Déconnecter Notion ? Les ressources seront conservées.",
    "notion.confirmDelete":     "Supprimer cette ressource ? Elle sera retirée du RAG.",
    "notion.resourceCategory":  "Catégorie",
    "notion.assignedProfiles":  "Profils avec accès",
    "notion.noProfiles":        "Aucun profil assigné",
    "notion.save":              "Enregistrer",
    "notion.cancel":            "Annuler",
    "notion.syncEnqueued":      "Synchronisation en file d'attente",
    "notion.connectFirst":      "Connectez votre espace Notion d'abord",

    // ── Profile detail — Notion sources panel ─────────────────────────────────
    "profile.notionSources":     "Sources Notion",
    "profile.notionSourcesHint": "Ressources Notion assignées à ce profil",
    "profile.noNotionSources":   "Aucune ressource Notion assignée",
    "profile.manageNotion":      "Gérer dans Intégrations →",
  },

  pt: {
    // ── Nav ──────────────────────────────────────────────────────────────────
    "nav.dashboard":     "Painel",
    "nav.companies":     "Empresas",
    "nav.profiles":      "Perfis",
    "nav.employees":     "Funcionários",
    "nav.conversations": "Conversas",
    "nav.documents":     "Documentos",
    "nav.tokens":        "Tokens",
    "nav.settings":      "Configurações",
    "nav.manuals":       "Manuais",
    "nav.integrations":  "Integrações",
    "nav.signout":       "Sair",
    "nav.viewingAs":     "Visualizando como",
    "nav.returnAdmin":   "Voltar ao Super Admin",

    // ── Manuals ───────────────────────────────────────────────────────────────
    "manuals.title":    "Manuais",
    "manuals.subtitle": "Manuais web gerados por IA para sua equipe",

    // ── Image editor ──────────────────────────────────────────────────────────
    "manuals.imgEdit.btn":          "Editar imagens",
    "manuals.imgEdit.title":        "Editar imagens por seção",
    "manuals.imgEdit.loading":      "Carregando…",
    "manuals.imgEdit.currentLabel": "Imagens atuais",
    "manuals.imgEdit.noImages":     "Sem imagens atribuídas a esta seção",
    "manuals.imgEdit.page":         "Página",
    "manuals.imgEdit.availableHint":"Imagens disponíveis do documento — clique para adicionar (máx. 3 por seção)",
    "manuals.imgEdit.noAvailable":  "Sem imagens disponíveis. As imagens são salvas ao gerar um manual.",
    "manuals.imgEdit.added":        "Adicionada",
    "manuals.imgEdit.cancel":       "Cancelar",
    "manuals.imgEdit.save":         "Salvar alterações",
    "manuals.imgEdit.saving":       "Salvando…",
    "manuals.imgEdit.errorLoad":    "Erro ao carregar imagens",
    "manuals.imgEdit.saved":        "Imagens salvas",
    "manuals.imgEdit.errorSave":    "Erro ao salvar imagens",

    // ── Settings page ─────────────────────────────────────────────────────────
    "settings.title":    "Configurações",
    "settings.subtitle": "Gerencie sua conta e preferências",
    "settings.saving":   "Salvando…",

    "settings.tab.profile":       "Perfil",
    "settings.tab.preferences":   "Preferências",
    "settings.tab.notifications": "Notificações",
    "settings.tab.integrations":  "Integrações",
    "settings.tab.audit":         "Log de auditoria",

    "settings.saved":          "Configurações salvas",
    "settings.saveFailed":     "Falha ao salvar",
    "settings.pwMismatch":     "As senhas não coincidem",
    "settings.pwTooShort":     "A senha deve ter no mínimo 8 caracteres",
    "settings.pwChanged":      "Senha alterada",
    "settings.pwChangeFailed": "Falha ao alterar senha",

    "settings.profile.section":   "Informações pessoais",
    "settings.profile.firstName": "Nome",
    "settings.profile.lastName":  "Sobrenome",
    "settings.profile.email":     "E-mail",
    "settings.profile.emailHint": "(contate seu admin para alterar)",
    "settings.profile.role":      "Função",
    "settings.profile.save":      "Salvar perfil",

    "settings.password.section": "Alterar senha",
    "settings.password.current": "Senha atual",
    "settings.password.new":     "Nova senha",
    "settings.password.newHint": "(mín. 8 caracteres)",
    "settings.password.confirm": "Confirmar nova senha",
    "settings.password.change":  "Alterar senha",

    "settings.prefs.section":  "Preferências do painel",
    "settings.prefs.language": "Idioma",
    "settings.prefs.timezone": "Fuso horário",
    "settings.prefs.save":     "Salvar preferências",

    "settings.notif.channels":         "Canais de notificação",
    "settings.notif.channelsHint":     "Receba alertas no WhatsApp ou Telegram quando eventos importantes ocorrerem.",
    "settings.notif.whatsapp":         "Número WhatsApp",
    "settings.notif.whatsappHint":     "(para notificações)",
    "settings.notif.telegram":         "ID Telegram",
    "settings.notif.telegramHint":     "(usuário ou numérico)",
    "settings.notif.events":           "Eventos de notificação",
    "settings.notif.escalations":      "Conversas escaladas",
    "settings.notif.escalationsHint":  "Alerta quando uma conversa é escalada ao RH",
    "settings.notif.newEmployees":     "Novo funcionário registrado",
    "settings.notif.newEmployeesHint": "Alerta quando um novo funcionário é adicionado",
    "settings.notif.viaWhatsapp":      "Receber por WhatsApp",
    "settings.notif.viaWhatsappHint":  "Receba notificações no seu número WhatsApp",
    "settings.notif.viaTelegram":      "Receber por Telegram",
    "settings.notif.viaTelegramHint":  "Receba notificações na sua conta Telegram",
    "settings.notif.save":             "Salvar notificações",

    "settings.integ.notionDesc":       "Importe agendas e documentação do seu workspace Notion",
    "settings.integ.connectedLabel":   "Conectado —",
    "settings.integ.manageHint":       "Gerencie os recursos sincronizados na seção de Integrações",
    "settings.integ.manage":           "Gerenciar →",
    "settings.integ.configure":        "Configurar →",
    "settings.integ.notConnectedHint": "Conecte o Notion para importar agendas e documentação para seus perfis",

    "settings.audit.page":   "Página",
    "settings.audit.noLogs": "Nenhum registro de auditoria",
    "settings.audit.prev":   "← Anterior",
    "settings.audit.next":   "Próximo →",

    // ── Integraciones setup page ──────────────────────────────────────────────
    "integ.title":    "Integrações",
    "integ.subtitle": "Conecte ferramentas externas para enriquecer as respostas do bot",
    "integ.back":     "← Configurações",

    "integ.notion.desc":    "Importe agendas, horários e documentação diretamente do seu workspace",
    "integ.connectedSince": "Conectado em",
    "integ.reconnect":      "Reconectar / mais páginas",
    "integ.manage":         "Gerenciar recursos →",

    "integ.tipReconnectTitle": "Quer adicionar mais páginas?",
    "integ.tipReconnectBody":  "Se durante a conexão inicial você não selecionou todas as páginas, clique em «Reconectar / mais páginas». O Notion mostrará novamente a tela de seleção de acesso.",

    "integ.setupHint": "Siga estes passos para conectar o Notion e permitir que seus funcionários consultem agendas e documentação pelo WhatsApp ou Telegram.",

    "integ.step1.title": "Clique em «Conectar com Notion»",
    "integ.step1.body":  "Vamos redirecioná-lo ao Notion para autorizar o acesso. Certifique-se de estar logado com a conta da sua empresa.",

    "integ.step2.title": "Selecione as páginas e bancos de dados no Notion",
    "integ.step2.body":  "O Notion mostrará uma tela onde você pode escolher quais páginas ou bancos de dados compartilhar com StaffBot.",
    "integ.step2.tip":   "Selecione TODAS as páginas e bancos de dados que deseja usar — agendas, procedimentos, horários, etc. Se precisar adicionar mais, use o botão «Reconectar / mais páginas».",

    "integ.step3.title": "Adicione cada recurso e atribua-o aos perfis corretos",
    "integ.step3.body":  "Após conectar, vá para Integrações → Notion. Lá você pode adicionar páginas/bancos de dados e escolher quais perfis de funcionários podem consultá-los.",
    "integ.step3.tip":   "Exemplo: a agenda da equipe de vendas apenas para o perfil «Vendas», os procedimentos de armazém apenas para «Armazém».",

    "integ.step4.title": "Pronto — o bot já responde com seu conteúdo do Notion",
    "integ.step4.body":  "Quando um funcionário fizer uma pergunta, o bot pesquisará nos recursos Notion atribuídos ao seu perfil.",

    "integ.connectBtn":    "Conectar com Notion →",
    "integ.connectingBtn": "Redirecionando para Notion…",

    // ── Notion resource manager ───────────────────────────────────────────────
    "notion.title":             "Integração Notion",
    "notion.subtitle":          "Conecte o Notion para importar agendas e documentação",
    "notion.connect":           "Conectar com Notion",
    "notion.disconnect":        "Desconectar",
    "notion.connected":         "Conectado",
    "notion.notConnected":      "Não conectado",
    "notion.workspace":         "Workspace",
    "notion.connectedAt":       "Conectado em",
    "notion.browse":            "Explorar workspace",
    "notion.resources":         "Recursos sincronizados",
    "notion.addResource":       "Adicionar recurso",
    "notion.sync":              "Sincronizar",
    "notion.delete":            "Excluir",
    "notion.editProfiles":      "Editar perfis",
    "notion.category.agenda":   "Agenda",
    "notion.category.document": "Documento",
    "notion.category.custom":   "Personalizado",
    "notion.type.database":     "Banco de dados",
    "notion.type.page":         "Página",
    "notion.status.pending":    "Pendente",
    "notion.status.syncing":    "Sincronizando",
    "notion.status.synced":     "Sincronizado",
    "notion.status.error":      "Erro",
    "notion.lastSynced":        "Última sync",
    "notion.chunks":            "fragmentos",
    "notion.selectProfiles":    "Selecionar perfis",
    "notion.noResources":       "Sem recursos adicionados",
    "notion.noResourcesHint":   "Conecte o Notion e adicione páginas ou bancos de dados.",
    "notion.confirmDisconnect": "Desconectar Notion? Os recursos serão mantidos.",
    "notion.confirmDelete":     "Excluir este recurso? Será removido do RAG.",
    "notion.resourceCategory":  "Categoria",
    "notion.assignedProfiles":  "Perfis com acesso",
    "notion.noProfiles":        "Sem perfis atribuídos",
    "notion.save":              "Salvar",
    "notion.cancel":            "Cancelar",
    "notion.syncEnqueued":      "Sincronização enfileirada",
    "notion.connectFirst":      "Conecte seu workspace Notion primeiro",

    // ── Profile detail — Notion sources panel ─────────────────────────────────
    "profile.notionSources":     "Fontes Notion",
    "profile.notionSourcesHint": "Recursos Notion atribuídos a este perfil",
    "profile.noNotionSources":   "Sem recursos Notion atribuídos",
    "profile.manageNotion":      "Gerenciar em Integrações →",
  },
};

export function getLang(): Lang {
  if (typeof window === "undefined") return "es";
  return (localStorage.getItem(STORAGE_KEY) as Lang) ?? "es";
}

export function setLang(lang: Lang) {
  localStorage.setItem(STORAGE_KEY, lang);
  window.dispatchEvent(new Event(LANG_EVENT));
}

export function useTranslation() {
  const [lang, setLangState] = useState<Lang>("es");

  useEffect(() => {
    setLangState(getLang());
    const handler = () => setLangState(getLang());
    window.addEventListener(LANG_EVENT, handler);
    return () => window.removeEventListener(LANG_EVENT, handler);
  }, []);

  function t(key: string): string {
    return translations[lang]?.[key] ?? translations["en"]?.[key] ?? key;
  }

  return { t, lang };
}
