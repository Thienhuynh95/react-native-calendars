import first from 'lodash/first';
import isFunction from 'lodash/isFunction';
import isNumber from 'lodash/isNumber';
import throttle from 'lodash/throttle';

import XDate from 'xdate';

import React, {
  useContext,
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useImperativeHandle,
  forwardRef
} from 'react';
import {
  AccessibilityInfo,
  PanResponder,
  Animated,
  View,
  Text,
  Image,
  ImageSourcePropType,
  GestureResponderEvent,
  PanResponderGestureState,
  TouchableOpacity,
  type LayoutChangeEvent
} from 'react-native';

import {page} from '../dateutils';
import {parseDate, toMarkingFormat} from '../interface';
import {DateData, Direction} from '../types';
import styleConstructor, {KNOB_CONTAINER_HEIGHT} from './style';
import WeekDaysNames from '../commons/WeekDaysNames';
import Calendar from '../calendar';
import CalendarList, {CalendarListProps} from '../calendar-list';
import Week from './week';
import WeekCalendar from './WeekCalendar';
import Context from './Context';
import constants from '../commons/constants';
import {UpdateSources, CalendarNavigationTypes} from './commons';

export enum Positions {
  CLOSED = 'closed',
  OPEN = 'open'
}
const SPEED = 20;
const BOUNCINESS = 6;
const WEEK_HEIGHT = 46;
const DAY_NAMES_PADDING = 24;
const PAN_GESTURE_THRESHOLD = 30;
const LEFT_ARROW = require('../calendar/img/previous.png');
const RIGHT_ARROW = require('../calendar/img/next.png');
const knobHitSlop = {left: 10, right: 10, top: 10, bottom: 10};
const DEFAULT_HEADER_HEIGHT = 78;

export interface ExpandableCalendarProps extends CalendarListProps {
  /** the initial position of the calendar ('open' or 'closed') */
  initialPosition?: Positions;
  /** callback that fires when the calendar is opened or closed */
  onCalendarToggled?: (isOpen: boolean) => void;
  /** an option to disable the pan gesture and disable the opening and closing of the calendar (initialPosition will persist)*/
  disablePan?: boolean;
  /** whether to hide the knob  */
  hideKnob?: boolean;
  /** source for the left arrow image */
  leftArrowImageSource?: ImageSourcePropType;
  /** source for the right arrow image */
  rightArrowImageSource?: ImageSourcePropType;
  /** whether to have shadow/elevation for the calendar */
  allowShadow?: boolean;
  /** whether to disable the week scroll in closed position */
  disableWeekScroll?: boolean;
  /** a threshold for opening the calendar with the pan gesture */
  openThreshold?: number;
  /** a threshold for closing the calendar with the pan gesture */
  closeThreshold?: number;
  /** Whether to close the calendar on day press. Default = true */
  closeOnDayPress?: boolean;
}

type ExpandableCalendarRef = {
  toggleCalendarPosition: () => boolean;
};

const headerStyleOverride = {
  stylesheet: {
    calendar: {
      header: {
        week: {
          marginTop: 7,
          marginBottom: -4, // reduce space between dayNames and first line of dates
          flexDirection: 'row',
          justifyContent: 'space-around'
        }
      }
    }
  }
};

/**
 * @description: Expandable calendar component
 * @note: Should be wrapped with 'CalendarProvider'
 * @extends: CalendarList
 * @extendslink: docs/CalendarList
 * @example: https://github.com/wix/react-native-calendars/blob/master/example/src/screens/expandableCalendar.js
 */

const ExpandableCalendar = forwardRef<ExpandableCalendarRef, ExpandableCalendarProps>((props, ref) => {
  const _context = useContext(Context);
  const {date, setDate, numberOfDays, timelineLeftInset} = _context;

  const {
    /** ExpandableCalendar props */
    initialPosition = Positions.CLOSED,
    onCalendarToggled,
    disablePan,
    hideKnob = numberOfDays && numberOfDays > 1,
    leftArrowImageSource = LEFT_ARROW,
    rightArrowImageSource = RIGHT_ARROW,
    allowShadow = true,
    disableWeekScroll,
    openThreshold = PAN_GESTURE_THRESHOLD,
    closeThreshold = PAN_GESTURE_THRESHOLD,
    closeOnDayPress = true,

    /** CalendarList props */
    horizontal = true,
    calendarStyle,
    theme,
    style: propsStyle,
    firstDay = 0,
    onDayPress,
    hideArrows,
    onPressArrowLeft,
    onPressArrowRight,
    renderArrow,
    testID,
    ...others
  } = props;

  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const onHeaderLayout = useCallback(
    ({
      nativeEvent: {
        layout: {height}
      }
    }: LayoutChangeEvent) => {
      setHeaderHeight(height || DEFAULT_HEADER_HEIGHT);
    },
    []
  );

  /** Date */

  const getYear = (date: string) => {
    const d = new XDate(date);
    return d.getFullYear();
  };
  const getMonth = (date: string) => {
    const d = new XDate(date);
    return d.getMonth() + 1; // getMonth() returns month's index' (0-11)
  };
  const visibleMonth = useRef(getMonth(date));
  const visibleYear = useRef(getYear(date));

  const isLaterDate = (date1?: DateData, date2?: string) => {
    if (date1 && date2) {
      if (date1.year > getYear(date2)) {
        return true;
      }
      if (date1.year === getYear(date2)) {
        if (date1.month > getMonth(date2)) {
          return true;
        }
      }
    }
    return false;
  };

  useEffect(() => {
    /** Scroll */
    const scrollToDate = (date: string) => {
      if (!horizontal) {
        calendarList?.current?.scrollToDay(date, 0, true);
      } else if (getYear(date) !== visibleYear.current || getMonth(date) !== visibleMonth.current) {
        // don't scroll if the month is already visible
        calendarList?.current?.scrollToMonth(date);
      }
    };

    // date was changed from AgendaList, arrows or scroll
    scrollToDate(date);
  }, [date, horizontal]);

  /** Number of weeks */

  const getNumberOfWeeksInMonth = (month: string) => {
    const days = page(new XDate(month), firstDay);
    return days.length / 7;
  };
  const numberOfWeeks = useRef(getNumberOfWeeksInMonth(date));

  /** Position */

  const [position, setPosition] = useState(numberOfDays ? Positions.CLOSED : initialPosition);
  const isOpen = position === Positions.OPEN;
  const getOpenHeight = useCallback(() => {
    if (!horizontal) {
      return Math.max(constants.screenHeight, constants.screenWidth);
    }
    return headerHeight + WEEK_HEIGHT * numberOfWeeks.current + (hideKnob ? 0 : KNOB_CONTAINER_HEIGHT);
  }, [headerHeight, horizontal, hideKnob, numberOfWeeks]);

  const openHeight = useRef(getOpenHeight());
  const closedHeight = useMemo(
    () => headerHeight + WEEK_HEIGHT + (hideKnob || Number(numberOfDays) > 1 ? 0 : KNOB_CONTAINER_HEIGHT),
    [numberOfDays, hideKnob, headerHeight]
  );
  const startHeight = useMemo(() => (isOpen ? getOpenHeight() : closedHeight), [closedHeight, isOpen, getOpenHeight]);
  const _height = useRef(startHeight);
  const deltaY = useMemo(() => new Animated.Value(startHeight), [startHeight]);
  const headerDeltaY = useRef(new Animated.Value(isOpen ? -headerHeight : 0));

  useEffect(() => {
    _height.current = startHeight;
    deltaY.setValue(startHeight);
    _wrapperStyles.current.style.height = startHeight;
  }, [startHeight]);

  useEffect(() => {
    openHeight.current = getOpenHeight();
  }, [headerHeight]);

  useEffect(() => {
    if (numberOfDays) {
      setPosition(Positions.CLOSED);
    }
  }, [numberOfDays]);

  /** Components' refs */

  const wrapper = useRef<any>();
  const calendarList = useRef<any>();
  const header = useRef<any>();
  const weekCalendarWrapper = useRef<any>();

  /** Styles */

  const style = useRef(styleConstructor(theme));
  const themeObject = Object.assign(headerStyleOverride, theme);

  const _wrapperStyles = useRef({style: {height: startHeight}});
  const _headerStyles = {style: {top: isOpen ? -headerHeight : 0}};
  const _weekCalendarStyles = {style: {opacity: isOpen ? 0 : 1}};

  const shouldHideArrows = !horizontal ? true : hideArrows || false;

  const updateNativeStyles = () => {
    wrapper?.current?.setNativeProps(_wrapperStyles.current);

    if (!horizontal) {
      header?.current?.setNativeProps(_headerStyles);
    } else {
      weekCalendarWrapper?.current?.setNativeProps(_weekCalendarStyles);
    }
  };

  const weekDaysStyle = useMemo(() => {
    const leftPaddings = calendarStyle?.paddingLeft;
    const rightPaddings = calendarStyle?.paddingRight;

    return [
      style.current.weekDayNames,
      {
        paddingLeft: isNumber(leftPaddings) ? leftPaddings + 6 : DAY_NAMES_PADDING,
        paddingRight: isNumber(rightPaddings) ? rightPaddings + 6 : DAY_NAMES_PADDING
      }
    ];
  }, [calendarStyle]);

  const animatedHeaderStyle = useMemo(() => {
    return [style.current.header, {height: headerHeight, top: headerDeltaY.current}];
  }, [headerDeltaY.current, headerHeight]);

  const weekCalendarStyle = useMemo(() => {
    return [style.current.weekContainer, isOpen ? style.current.hidden : style.current.visible, {top: headerHeight}];
  }, [isOpen, headerHeight]);

  const containerStyle = useMemo(() => {
    return [
      allowShadow && style.current.containerShadow,
      propsStyle,
      headerHeight === 0 && style.current.hidden,
      {overflow: 'hidden'} as const
    ];
  }, [allowShadow, propsStyle, headerHeight]);

  const wrapperStyle = useMemo(() => {
    return {height: deltaY};
  }, [deltaY]);

  const numberOfDaysHeaderStyle = useMemo(() => {
    if (numberOfDays && numberOfDays > 1) {
      return {paddingHorizontal: 0};
    }
  }, [numberOfDays]);

  const _headerStyle = useMemo(() => {
    return [numberOfDaysHeaderStyle, props.headerStyle];
  }, [props.headerStyle, numberOfDaysHeaderStyle]);

  /** AccessibilityInfo */

  useEffect(() => {
    if (AccessibilityInfo) {
      if (AccessibilityInfo.isScreenReaderEnabled) {
        AccessibilityInfo.isScreenReaderEnabled().then(handleScreenReaderStatus);
        //@ts-expect-error
      } else if (AccessibilityInfo.fetch) {
        // Support for older RN versions
        //@ts-expect-error
        AccessibilityInfo.fetch().then(handleScreenReaderStatus);
      }
    }
  }, []);

  const handleScreenReaderStatus = (screenReaderEnabled: any) => {
    setScreenReaderEnabled(screenReaderEnabled);
    if (!screenReaderEnabled) {
      setHeaderHeight(DEFAULT_HEADER_HEIGHT);
    }
  };

  const scrollPage = useCallback(
    (next: boolean, updateSource = UpdateSources.PAGE_SCROLL) => {
      if (horizontal) {
        const d = parseDate(date);

        if (isOpen) {
          d.setDate(1);
          d.addMonths(next ? 1 : -1);
        } else {
          let dayOfTheWeek = d.getDay();

          if (dayOfTheWeek < firstDay && firstDay > 0) {
            dayOfTheWeek = 7 + dayOfTheWeek;
          }

          if (numberOfDays) {
            const daysToAdd = numberOfDays <= 1 ? 7 : numberOfDays;
            d.addDays(next ? daysToAdd : -daysToAdd);
          } else {
            const firstDayOfWeek = (next ? 7 : -7) - dayOfTheWeek + firstDay;
            d.addDays(firstDayOfWeek);
          }
        }

        setDate?.(toMarkingFormat(d), updateSource);
      }
    },
    [horizontal, isOpen, firstDay, numberOfDays, setDate, date]
  );

  /** Pan Gesture */

  const handleMoveShouldSetPanResponder = (_: GestureResponderEvent, gestureState: PanResponderGestureState) => {
    if (disablePan) {
      return false;
    }
    if (!horizontal && isOpen) {
      // disable pan detection when vertical calendar is open to allow calendar scroll
      return false;
    }
    if (!isOpen && gestureState.dy < 0) {
      // disable pan detection to limit to closed height
      return false;
    }
    return gestureState.dy > 5 || gestureState.dy < -5;
  };

  const handlePanResponderMove = (_: GestureResponderEvent, gestureState: PanResponderGestureState) => {
    // limit min height to closed height and max to open height
    _wrapperStyles.current.style.height = Math.min(
      Math.max(closedHeight, _height.current + gestureState.dy),
      openHeight.current
    );

    if (!horizontal) {
      // vertical CalenderList header
      _headerStyles.style.top = Math.min(Math.max(-gestureState.dy, -headerHeight), 0);
    } else {
      // horizontal Week view
      if (!isOpen) {
        _weekCalendarStyles.style.opacity = Math.min(1, Math.max(1 - gestureState.dy / 100, 0));
      } else if (gestureState.dy < 0) {
        _weekCalendarStyles.style.opacity = Math.max(0, Math.min(Math.abs(gestureState.dy / 200), 1));
      }
    }

    updateNativeStyles();
  };

  const handlePanResponderEnd = () => {
    _height.current = Number(_wrapperStyles.current.style.height);
    bounceToPosition();
  };
  const numberOfDaysCondition = useMemo(() => {
    return !numberOfDays || (numberOfDays && numberOfDays <= 1);
  }, [numberOfDays]);

  const panResponder = useMemo(
    () =>
      numberOfDaysCondition
        ? PanResponder.create({
            onMoveShouldSetPanResponder: handleMoveShouldSetPanResponder,
            onPanResponderMove: handlePanResponderMove,
            onPanResponderRelease: handlePanResponderEnd,
            onPanResponderTerminate: handlePanResponderEnd
          })
        : PanResponder.create({}),
    [numberOfDays, position, headerHeight]
  ); // All the functions here rely on headerHeight directly or indirectly through refs that are updated in useEffect

  /** Animated */

  const resetWeekCalendarOpacity = async (isOpen: boolean) => {
    _weekCalendarStyles.style.opacity = isOpen ? 0 : 1;
    updateNativeStyles();
  };

  const toggleAnimatedHeader = (isOpen: boolean) => {
    headerDeltaY.current.setValue(Number(_headerStyles.style.top)); // set the start position for the animated value
    if (!horizontal) {
      Animated.spring(headerDeltaY.current, {
        toValue: isOpen ? -headerHeight : 0,
        speed: SPEED / 10,
        bounciness: 1,
        useNativeDriver: false
      }).start();
    }
  };

  const bounceToPosition = useCallback(
    (toValue = 0) => {
      const threshold = isOpen ? openHeight.current - closeThreshold : closedHeight + openThreshold;
      let _isOpen = _height.current >= threshold;
      const newValue = _isOpen ? openHeight.current : closedHeight;

      deltaY.setValue(_height.current); // set the start position for the animated value
      _height.current = toValue || newValue;
      _isOpen = _height.current >= threshold; // re-check after _height.current was set

      resetWeekCalendarOpacity(_isOpen);
      Animated.spring(deltaY, {
        toValue: _height.current,
        speed: SPEED,
        bounciness: BOUNCINESS,
        useNativeDriver: false
      }).start(() => {
        onCalendarToggled?.(_isOpen);
        setPosition(() => (_height.current === closedHeight ? Positions.CLOSED : Positions.OPEN));
      });
      toggleAnimatedHeader(_isOpen);
    },
    [isOpen, closeThreshold, closedHeight, openThreshold, deltaY]
  );

  const closeCalendar = useCallback(() => {
    setTimeout(() => {
      // to allows setDate to be completed
      if (isOpen) {
        bounceToPosition(closedHeight);
      }
    }, 0);
  }, [isOpen, closedHeight]);

  const toggleCalendarPosition = useCallback(() => {
    bounceToPosition(isOpen ? closedHeight : openHeight.current);
    return !isOpen;
  }, [isOpen, bounceToPosition, closedHeight]);

  useImperativeHandle(
    ref,
    () => ({
      toggleCalendarPosition
    }),
    [toggleCalendarPosition]
  );

  /** Events */

  const _onPressArrowLeft = useCallback(
    (method: () => void, month?: XDate) => {
      onPressArrowLeft?.(method, month);
      scrollPage(false, isOpen ? UpdateSources.ARROW_PRESS : UpdateSources.WEEK_ARROW_PRESS);
    },
    [isOpen, onPressArrowLeft, scrollPage]
  );

  const _onPressArrowRight = useCallback(
    (method: () => void, month?: XDate) => {
      onPressArrowRight?.(method, month);
      scrollPage(true, isOpen ? UpdateSources.ARROW_PRESS : UpdateSources.WEEK_ARROW_PRESS);
    },
    [isOpen, onPressArrowRight, scrollPage]
  );

  const _onDayPress = useCallback(
    (value: DateData) => {
      if (numberOfDaysCondition) {
        setDate?.(value.dateString, UpdateSources.DAY_PRESS);
      }
      if (closeOnDayPress && !disablePan) {
        closeCalendar();
      }
      onDayPress?.(value);
    },
    [numberOfDaysCondition, closeOnDayPress, disablePan, onDayPress, setDate, closeCalendar]
  );

  const onVisibleMonthsChange = useCallback(
    throttle(
      (value: DateData[]) => {
        const newDate = first(value);
        if (newDate) {
          const month = newDate.month;
          if (month && visibleMonth.current !== month) {
            visibleMonth.current = month;

            const year = newDate.year;
            if (year) {
              visibleYear.current = year;
            }

            // for horizontal scroll
            if (visibleMonth.current !== getMonth(date)) {
              const next = isLaterDate(newDate, date);
              scrollPage(next);
            }

            // updating openHeight
            setTimeout(() => {
              // to wait for setDate() call in horizontal scroll (scrollPage())
              const _numberOfWeeks = getNumberOfWeeksInMonth(newDate.dateString);
              if (_numberOfWeeks !== numberOfWeeks.current) {
                numberOfWeeks.current = _numberOfWeeks;
                openHeight.current = getOpenHeight();
                if (isOpen) {
                  bounceToPosition(openHeight.current);
                }
              }
            }, 0);
          }
        }
      },
      100,
      {trailing: true, leading: false}
    ),
    [date, scrollPage]
  );

  /** Renders */

  const _renderArrow = useCallback(
    (direction: Direction) => {
      if (isFunction(renderArrow)) {
        return renderArrow(direction);
      }

      return (
        <Image
          source={direction === 'right' ? rightArrowImageSource : leftArrowImageSource}
          style={style.current.arrowImage}
          testID={`${testID}.${direction}Arrow`}
        />
      );
    },
    [renderArrow, rightArrowImageSource, leftArrowImageSource, testID]
  );

  const renderWeekDaysNames = useCallback(() => {
    return (
      <View style={weekDaysStyle}>
        <WeekDaysNames firstDay={firstDay} style={style.current.dayHeader}/>
      </View>
    );
  }, [firstDay, weekDaysStyle, style]);

  const renderAnimatedHeader = useCallback(() => {
    const monthYear = new XDate(date)?.toString('MMMM yyyy');

    return (
      <Animated.View ref={header} style={animatedHeaderStyle} pointerEvents={'none'}>
        <Text allowFontScaling={false} style={style.current.headerTitle}>
          {monthYear}
        </Text>
        {renderWeekDaysNames()}
      </Animated.View>
    );
  }, [date, renderWeekDaysNames, animatedHeaderStyle, style]);

  const renderKnob = () => {
    return (
      <View style={style.current.knobContainer} pointerEvents={'box-none'}>
        <TouchableOpacity
          style={style.current.knob}
          testID={`${testID}.knob`}
          onPress={toggleCalendarPosition}
          hitSlop={knobHitSlop}
        />
      </View>
    );
  };

  const renderWeekCalendar = () => {
    const WeekComponent = disableWeekScroll ? Week : WeekCalendar;

    return (
      <Animated.View ref={weekCalendarWrapper} style={weekCalendarStyle} pointerEvents={isOpen ? 'none' : 'auto'}>
        <WeekComponent
          testID={`${testID}.weekCalendar`}
          firstDay={firstDay}
          {...others}
          allowShadow={disableWeekScroll ? undefined : false}
          current={disableWeekScroll ? date : undefined}
          theme={themeObject}
          style={calendarStyle}
          hideDayNames={true}
          onDayPress={_onDayPress}
          accessibilityElementsHidden // iOS
          importantForAccessibility={'no-hide-descendants'} // Android
        />
      </Animated.View>
    );
  };

  const renderCalendarList = () => {
    return (
      <CalendarList
        testID={`${testID}.calendarList`}
        horizontal={horizontal}
        firstDay={firstDay}
        calendarStyle={calendarStyle}
        onHeaderLayout={onHeaderLayout}
        {...others}
        current={date}
        theme={themeObject}
        ref={calendarList}
        onDayPress={_onDayPress}
        onVisibleMonthsChange={onVisibleMonthsChange}
        pagingEnabled
        scrollEnabled={isOpen}
        hideArrows={shouldHideArrows}
        onPressArrowLeft={_onPressArrowLeft}
        onPressArrowRight={_onPressArrowRight}
        hideExtraDays={!horizontal && isOpen}
        renderArrow={_renderArrow}
        staticHeader
        numberOfDays={numberOfDays}
        headerStyle={_headerStyle}
        timelineLeftInset={timelineLeftInset}
        context={_context}
      />
    );
  };

  return (
    <View testID={testID} style={containerStyle}>
      {screenReaderEnabled ? (
        <Calendar
          testID={`${testID}.calendarAccessible`}
          {...others}
          theme={themeObject}
          onHeaderLayout={onHeaderLayout}
          onDayPress={_onDayPress}
          hideExtraDays
          renderArrow={_renderArrow}
        />
      ) : (
        <Animated.View
          testID={`${testID}.expandableContainer`}
          ref={wrapper}
          style={wrapperStyle}
          {...panResponder.panHandlers}
        >
          {renderCalendarList()}
          {renderWeekCalendar()}
          {!hideKnob && renderKnob()}
          {!horizontal && renderAnimatedHeader()}
        </Animated.View>
      )}
    </View>
  );
});

export default Object.assign(ExpandableCalendar, {
  displayName: 'ExpandableCalendar',
  positions: Positions,
  navigationTypes: CalendarNavigationTypes,
  defaultProps: {
    horizontal: true,
    initialPosition: Positions.CLOSED,
    firstDay: 0,
    leftArrowImageSource: LEFT_ARROW,
    rightArrowImageSource: RIGHT_ARROW,
    allowShadow: true,
    openThreshold: PAN_GESTURE_THRESHOLD,
    closeThreshold: PAN_GESTURE_THRESHOLD,
    closeOnDayPress: true
  }
});
