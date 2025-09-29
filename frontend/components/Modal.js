import React from 'react';
import { View, Text } from 'react-native';

import { modalStyles as s } from './ModalStyles';
import { text as t } from 'core/text';
import Button from './Button';

export default function Modal({ visible, onClose, sections, activeSection, setActiveSection, children, title }) {
  if (!visible) return null;

  return (
    <View style={s.overlay}>
      <View style={s.container}>
        <View style={s.content}>
          {sections && (
            <View style={s.navRow}>
              {sections.map((section) => (
                <Button
                  key={section.id}
                  label={section.label}
                  onPress={() => setActiveSection(section.id)}
                  style={[
                    s.navButton,
                    activeSection === section.id && s.navButtonSelected
                  ]}
                  textStyle={s.navButtonText}
                />
              ))}
            </View>
          )}
          
          <View style={s.contentArea}>
            <View style={s.sectionContent}>
              {title && <Text style={s.sectionTitle}>{title}</Text>}
              {children}
            </View>
          </View>
        </View>
        
        <View style={s.footer}>
          <Button 
            label={t.close}
            onPress={onClose}
            style={s.closeButton}
          />
        </View>
      </View>
    </View>
  );
}