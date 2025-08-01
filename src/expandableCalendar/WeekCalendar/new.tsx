import React, {useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {View} from 'react-native';
import XDate from 'xdate';

import {CalendarListProps} from '../../calendar-list';
import constants from '../../commons/constants';
import WeekDaysNames from '../../commons/WeekDaysNames';
import {extractCalendarProps} from '../../componentUpdater';
import {sameWeek} from '../../dateutils';
import InfiniteList from '../../infinite-list';
import {toMarkingFormat} from '../../interface';
import {DateData} from '../../types';
import {UpdateSources} from '../commons';
import CalendarContext from '../Context';
import styleConstructor from '../style';
import Week from '../week';

export interface WeekCalendarProps extends CalendarListProps {
  /** whether to have shadow/elevation for the calendar */
  allowShadow?: boolean;
}

const NUMBER_OF_PAGES = 50;
const DEFAULT_PAGE_HEIGHT = 48;

const WeekCalendar = (props: WeekCalendarProps) => {
  const {
    current,
    firstDay = 0,
    markedDates,
    allowShadow = true,
    hideDayNames,
    theme,
    calendarWidth,
    calendarHeight = DEFAULT_PAGE_HEIGHT,
    testID
  } = props;
  const context = useContext(CalendarContext);
  const {date, updateSource} = context;
  const style = useRef(styleConstructor(theme));
  const list = useRef();
  const [items, setItems] = useState(getDatesArray(current || date, firstDay, NUMBER_OF_PAGES));

  const extraData = {
    current,
    date: context.date,
    firstDay
  };

  const containerWidth = calendarWidth || constants.screenWidth;
  const weekStyle = useMemo(() => {
    return [{width: containerWidth}, props.style];
  }, [containerWidth, props.style]);

  useEffect(() => {
    if (updateSource !== UpdateSources.WEEK_SCROLL) {
      const pageIndex = items.findIndex(item => sameWeek(item, date, firstDay));
      // @ts-expect-error
      list.current?.scrollToOffset?.(pageIndex * containerWidth, 0, false);
    }
  }, [date]);

  const onDayPress = useCallback(
    (dateData: DateData) => {
      context.setDate?.(dateData.dateString, UpdateSources.DAY_PRESS);
      props.onDayPress?.(dateData);
    },
    [props.onDayPress]
  );

  const onPageChange = useCallback(
    (pageIndex: number, _prevPage, {scrolledByUser}) => {
      if (scrolledByUser) {
        context?.setDate(items[pageIndex], UpdateSources.WEEK_SCROLL);
      }
    },
    [items]
  );

  const reloadPages = useCallback(
    pageIndex => {
      const date = items[pageIndex];
      setItems(getDatesArray(date, firstDay, NUMBER_OF_PAGES));
    },
    [items]
  );

  const renderItem = useCallback(
    (_type: any, item: string) => {
      const {allowShadow, ...calendarListProps} = props;
      const {/* style,  */ ...others} = extractCalendarProps(calendarListProps);

      const isSameWeek = sameWeek(item, date, firstDay);

      return (
        <Week
          {...others}
          key={item}
          current={isSameWeek ? date : item}
          firstDay={firstDay}
          style={weekStyle}
          markedDates={markedDates}
          onDayPress={onDayPress}
          context={context}
        />
      );
    },
    [date, markedDates, props, firstDay, weekStyle, onDayPress, context]
  );

  return (
    <View
      testID={testID}
      style={[allowShadow && style.current.containerShadow, !hideDayNames && style.current.containerWrapper]}
    >
      {!hideDayNames && (
        <View style={[style.current.week, style.current.weekCalendar]}>
          <WeekDaysNames firstDay={firstDay} style={style.current.dayHeader}/>
        </View>
      )}
      <View>
        <InfiniteList
          key="week-list"
          isHorizontal
          ref={list}
          data={items}
          renderItem={renderItem}
          reloadPages={reloadPages}
          onReachNearEdgeThreshold={Math.round(NUMBER_OF_PAGES * 0.4)}
          extendedState={extraData}
          style={style.current.container}
          initialPageIndex={NUMBER_OF_PAGES}
          pageHeight={calendarHeight}
          pageWidth={containerWidth}
          onPageChange={onPageChange}
          scrollViewProps={{
            showsHorizontalScrollIndicator: false
          }}
        />
      </View>
    </View>
  );
};

export default WeekCalendar;

// function getDate({current, context, firstDay = 0}: WeekCalendarProps, weekIndex: number) {
function getDate(date: string, firstDay: number, weekIndex: number) {
  // const d = new XDate(current || context.date);
  const d = new XDate(date);
  // get the first day of the week as date (for the on scroll mark)
  let dayOfTheWeek = d.getDay();
  if (dayOfTheWeek < firstDay && firstDay > 0) {
    dayOfTheWeek = 7 + dayOfTheWeek;
  }

  // leave the current date in the visible week as is
  const dd = weekIndex === 0 ? d : d.addDays(firstDay - dayOfTheWeek);
  const newDate = dd.addWeeks(weekIndex);
  return toMarkingFormat(newDate);
}

// function getDatesArray(args: WeekCalendarProps, numberOfPages = NUMBER_OF_PAGES) => {
function getDatesArray(date: string, firstDay: number, numberOfPages = NUMBER_OF_PAGES) {
  const array: string[] = [];
  for (let index = -numberOfPages; index <= numberOfPages; index++) {
    const d = getDate(date, firstDay, index);
    array.push(d);
  }
  return array;
}
