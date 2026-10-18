import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {WorldBracketModeControl} from '../src/entrypoints/shared/WorldBracketModeControl';
import {storyMessageModeText} from '../src/core/story-message-mode-i18n';
afterEach(cleanup);
for(const locale of ['ru','en'] as const)it(`${locale}: accessible world-local toggle has visible scope and no auto save`,()=>{
  const onChange=vi.fn();const view=render(<WorldBracketModeControl locale={locale} enabled={false} onChange={onChange}/>);
  const toggle=screen.getByRole('switch',{name:storyMessageModeText(locale,'label')});expect(toggle).not.toBeChecked();expect(toggle).toHaveAccessibleDescription(storyMessageModeText(locale,'hint'));
  expect(screen.getByText(storyMessageModeText(locale,'scope'))).toBeVisible();expect(onChange).not.toHaveBeenCalled();fireEvent.click(toggle);expect(onChange).toHaveBeenCalledWith(true);
  view.rerender(<WorldBracketModeControl locale={locale} enabled={true} onChange={onChange}/>);expect(toggle).toBeChecked();
});
