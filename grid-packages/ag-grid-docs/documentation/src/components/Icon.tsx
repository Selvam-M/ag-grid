import * as CarbonIcon from '@carbon/icons-react';
import classNames from 'classnames';
import React from 'react';
import EnterpriseIcon from '../images/inline-svgs/enterprise.svg';
import styles from './Icon.module.scss';

// Uses IBM Carbon Design System icons as a base
// Full list of Carbon icons => https://carbondesignsystem.com/guidelines/icons/library

export const ICON_MAP = {
    info: CarbonIcon.Information,
    warning: CarbonIcon.WarningAlt,
    email: CarbonIcon.Email,
    creditCard: CarbonIcon.Purchase,
    lightBulb: CarbonIcon.Idea,
    enterprise: EnterpriseIcon,
};

export type IconName = keyof typeof ICON_MAP;

type Props = { name: IconName; svgClasses?: string };

export const Icon = ({ name, svgClasses }: Props) => {
    const IconSvg = ICON_MAP[name];

    return <IconSvg size="32" className={classNames(styles.icon, 'icon', svgClasses)} />;
};
