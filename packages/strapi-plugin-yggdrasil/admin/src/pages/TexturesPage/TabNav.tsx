import { Flex } from '@strapi/design-system';
import { useTheme } from 'styled-components';
import { useTranslate } from '../../hooks/useTranslate';

type Tab = 'skins' | 'capes';

interface TabNavProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

const TABS: readonly Tab[] = ['skins', 'capes'];

const TabNav = ({ active, onChange }: TabNavProps) => {
  const translate = useTranslate();
  const theme = useTheme();
  return (
    <Flex gap={1} alignItems="flex-start">
      {TABS.map((tab) => {
        const isActive = active === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            style={{
              padding: '10px 20px',
              border: `1px solid ${isActive ? theme.colors.primary600 : theme.colors.neutral200}`,
              borderRadius: 6,
              background: isActive ? theme.colors.primary100 : 'transparent',
              color: isActive ? theme.colors.primary700 : theme.colors.neutral500,
              fontSize: 14,
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              outline: 'none',
              transition: 'color 0.15s, border-color 0.15s, background 0.15s',
            }}
          >
            {translate(tab === 'skins' ? 'tab.skins' : 'tab.capes')}
          </button>
        );
      })}
    </Flex>
  );
};

export default TabNav;
