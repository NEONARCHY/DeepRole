import {useId} from 'react';
import type {Locale} from '../../core/types';
import {storyMessageModeText} from '../../core/story-message-mode-i18n';
export function WorldBracketModeControl({locale,enabled,onChange}:{locale:Locale;enabled:boolean;onChange:(value:boolean)=>void}){
  const id=useId(),t=(key:Parameters<typeof storyMessageModeText>[1])=>storyMessageModeText(locale,key);
  return <div className="rp-world-message-mode">
    <label className="dr-bond-toggle"><span>{t('label')}</span><input type="checkbox" role="switch" checked={enabled} aria-describedby={id} onChange={e=>onChange(e.target.checked)}/></label>
    <p className="rp-hint" id={id}>{t('hint')}</p><p className="rp-hint">{t('scope')}</p>
  </div>;
}
