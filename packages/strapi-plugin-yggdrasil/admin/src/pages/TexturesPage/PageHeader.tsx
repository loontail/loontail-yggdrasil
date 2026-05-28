import { Box, Button, Flex, Typography } from '@strapi/design-system';
import { ArrowClockwise, Plus, Trash } from '@strapi/icons';
import { useTranslate } from '../../hooks/useTranslate';

interface PageHeaderProps {
  skinsTotal: number;
  capesTotal: number;
  missingCount: number;
  validating: boolean;
  purging: boolean;
  onValidate: () => void;
  onPurgeMissing: () => void;
  onRefresh: () => void;
  onUpload: () => void;
}

const PageHeader = ({
  skinsTotal,
  capesTotal,
  missingCount,
  validating,
  purging,
  onValidate,
  onPurgeMissing,
  onRefresh,
  onUpload,
}: PageHeaderProps) => {
  const translate = useTranslate();
  return (
    <Flex justifyContent="space-between" alignItems="flex-start">
      <Box>
        <Typography variant="alpha">{translate('textures.page.title')}</Typography>
        <Box paddingTop={1}>
          <Typography variant="epsilon" textColor="neutral500">
            {translate('textures.page.subtitle', { skinsTotal, capesTotal })}
          </Typography>
        </Box>
      </Box>
      <Flex gap={2} style={{ paddingTop: 4 }}>
        {missingCount > 0 && (
          <Button startIcon={<Trash />} variant="danger" loading={purging} onClick={onPurgeMissing}>
            {translate('button.deleteMissing', { count: missingCount })}
          </Button>
        )}
        <Button
          startIcon={<ArrowClockwise />}
          variant="secondary"
          loading={validating}
          onClick={onValidate}
        >
          {translate('button.validate')}
        </Button>
        <Button startIcon={<ArrowClockwise />} variant="secondary" onClick={onRefresh}>
          {translate('button.refresh')}
        </Button>
        <Button startIcon={<Plus />} onClick={onUpload}>
          {translate('button.upload')}
        </Button>
      </Flex>
    </Flex>
  );
};

export default PageHeader;
