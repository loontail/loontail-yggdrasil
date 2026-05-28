import { Box, EmptyStateLayout, Main } from '@strapi/design-system';
import { useTranslate } from '../../hooks/useTranslate';

const SessionsPage = () => {
  const translate = useTranslate();
  return (
    <Main>
      <Box padding={10}>
        <EmptyStateLayout icon={<Box />} content={translate('sessions.empty.title')} />
      </Box>
    </Main>
  );
};

export default SessionsPage;
