// Le schema HA est maintenant partagé via @maison-3d/ha-systems. Ce fichier
// est un re-export pour ne pas casser les call-sites existants de l'éditeur.
export { HA_METADATA_KEY } from '@maison-3d/ha-systems'
export type {
  HAEntityBinding,
  HAMapping,
  HAVisualMapping,
  HAEmissiveVisual,
  HACoverVisual,
  HALabelVisual,
  HAColorVisual,
  HAAction,
  HAToggleAction,
  HACallServiceAction,
  HAPopupAction,
  HAPopupType,
  HANavigateAction,
  HANoneAction,
} from '@maison-3d/ha-systems'
