import { createContext, useContext } from 'react';
import type { ComponentType, InputHTMLAttributes, ReactNode } from 'react';
import type { House } from 'lucide-react';

export type AppLanguage = 'it' | 'ar';

export type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  fieldClassName?: string;
};

export type ModalProps = {
  title: string;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
  rightHalf?: boolean;
  narrowPanel?: boolean;
  portal?: boolean;
};

export type TableProps = { headings: string[]; children: ReactNode };
export type DetailProps = { label: string; value: string };
export type EmptyProps = { icon: typeof House; title: string; detail: string };
export type SelectFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  labels?: string[];
  preserveLabels?: boolean;
};
export type FilterSelectFieldProps = SelectFieldProps;
export type LocalizedNodesProps = { children: ReactNode };
export type MetricProps = {
  icon: typeof House;
  label: string;
  value: string;
  detail: string;
  compact?: boolean;
  action?: ReactNode;
  className?: string;
  valueDir?: 'ltr' | 'rtl';
};
export type SectionHeadingProps = {
  icon: typeof House;
  title: string;
  detail: string;
  action: ReactNode;
};
export type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  numericOnly?: boolean;
};

export type PageServices = {
  language: AppLanguage;
  text: (value: string) => string;
  money: Pick<Intl.NumberFormat, 'format'>;
  quantityFormat: Intl.NumberFormat;
  receiptDate: Pick<Intl.DateTimeFormat, 'format'>;
  dateTimeText: (date: Date) => string;
  formatLocalDate: (value: string) => string;
  errorText: (error: unknown) => string;
  Field: ComponentType<FieldProps>;
  Modal: ComponentType<ModalProps>;
  Table: ComponentType<TableProps>;
  Detail: ComponentType<DetailProps>;
  Empty: ComponentType<EmptyProps>;
  SelectField: ComponentType<SelectFieldProps>;
  FilterSelectField: ComponentType<FilterSelectFieldProps>;
  LocalizedNodes: ComponentType<LocalizedNodesProps>;
  Metric: ComponentType<MetricProps>;
  SectionHeading: ComponentType<SectionHeadingProps>;
  SearchInput: ComponentType<SearchInputProps>;
};

const PageServicesContext = createContext<PageServices | null>(null);

export const PageServicesProvider = PageServicesContext.Provider;

export function usePageServices(): PageServices {
  const services = useContext(PageServicesContext);
  if (!services) throw new Error('PageServicesProvider is missing.');
  return services;
}
